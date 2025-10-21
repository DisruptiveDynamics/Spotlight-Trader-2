import { validateEnv } from "@shared/env";
import type { Express } from "express";
import type { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import cookie from "cookie";

import type { PinAuthPayload } from "../middleware/requirePin";

const APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "dev_secret_change_me";
import { voiceCalloutBridge } from "./voiceCalloutBridge";
import { ToolCallTracker } from "../coach/responseGuard.js";
import { getMinimalSessionUpdate, getInitialSessionUpdate } from "../coach/sessionContext";
import { traderPatternDetector } from "../coach/traderPatternDetector";
import { voiceMemoryBridge } from "../coach/voiceMemoryBridge";
import { toolHandlers } from "../copilot/tools/handlers";
import {
  recordWSConnection,
  recordWSDisconnection,
  recordWSLRUEviction,
} from "../metrics/registry";
// TODO: Integrate market context checks into voice responses
// import { ensureMarketContext } from "../coach/ensureMarketContext.js";

const env = validateEnv(process.env);

interface ConnectionInfo {
  ws: WebSocket;
  lastActivity: number;
}

const activeConnections = new Map<string, ConnectionInfo[]>();

const MAX_CONNECTIONS_PER_USER = 3;
const HEARTBEAT_INTERVAL = 25000;

// Server-side OpenAI error cooldown (prevents hammering OpenAI during outages)
let openaiErrorCount = 0;
let openaiCooldownUntil = 0;
const OPENAI_ERROR_THRESHOLD = 3;
// Dev: 10s cooldown for faster iteration, Prod: 2min to protect from outages
const OPENAI_COOLDOWN_MS = process.env.NODE_ENV === "production" ? 2 * 60 * 1000 : 10 * 1000;

export function setupVoiceProxy(app: Express, server: HTTPServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws/realtime")) {
      const origin = request.headers.origin || "";
      const allowedOrigins = [env.APP_ORIGIN, env.ADMIN_ORIGIN];

      // Allow Replit preview domains when REPL_ID is present
      const isReplitDev = process.env.REPL_ID && origin.endsWith(".replit.dev");

      // Allow localhost/127.0.0.1 in development (not production)
      const isLocalhost = origin.includes("localhost") || origin.includes("127.0.0.1");
      const isDev = process.env.NODE_ENV !== "production";

      // Dev-mode diagnostic bypass (diagnostic only)
      if (isDev && request.url?.includes("diag=1")) {
        console.warn("[WS] DEV DIAG BYPASS ENABLED for", request.url);
        // Skip auth checks - allow diagnostic connection
      } else {
        const isAllowed = allowedOrigins.includes(origin) || isReplitDev || (isDev && isLocalhost);

        if (!isAllowed) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (clientWs, request) => {
    console.log("[VoiceProxy] Client WebSocket connected");

    // Check OpenAI error cooldown - reject new connections during cooldown
    const now = Date.now();
    if (now < openaiCooldownUntil) {
      const remainingMs = openaiCooldownUntil - now;
      const remainingSec = Math.ceil(remainingMs / 1000);
      console.warn(
        `[VoiceProxy] In cooldown period. ${remainingSec}s remaining. Rejecting connection.`,
      );

      clientWs.send(
        JSON.stringify({
          type: "error",
          error: {
            type: "cooldown",
            message: `OpenAI voice service is temporarily unavailable. Please retry in ${remainingSec} seconds.`,
            cooldownUntil: openaiCooldownUntil,
          },
        }),
      );
      clientWs.close(1008, "Service in cooldown");
      return;
    }

    // Verify PIN authentication via cookie
    let userId: string;
    try {
      const cookies = cookie.parse(request.headers.cookie || "");
      const authCookie = cookies["st_auth"];
      
      if (!authCookie) {
        clientWs.send(JSON.stringify({ type: "error", error: "Not authenticated" }));
        clientWs.close(1008, "Authentication required");
        return;
      }

      const decoded = jwt.verify(authCookie, APP_AUTH_SECRET) as PinAuthPayload;
      if (!decoded || decoded.typ !== "pin") {
        clientWs.send(JSON.stringify({ type: "error", error: "Invalid authentication" }));
        clientWs.close(1008, "Invalid authentication");
        return;
      }

      userId = decoded.sub;
    } catch (err) {
      console.error("[VoiceProxy] Auth failed:", err);
      clientWs.send(JSON.stringify({ type: "error", error: "Authentication failed" }));
      clientWs.close(1008, "Authentication failed");
      return;
    }

    if (!activeConnections.has(userId)) {
      activeConnections.set(userId, []);
    }

    const userConnections = activeConnections.get(userId)!;

    if (userConnections.length >= MAX_CONNECTIONS_PER_USER) {
      userConnections.sort((a, b) => a.lastActivity - b.lastActivity);
      const lruConnection = userConnections.shift();
      if (lruConnection) {
        recordWSLRUEviction();
        lruConnection.ws.close(1000, "Connection limit reached - disconnecting LRU");
      }
    }

    const connectionInfo: ConnectionInfo = {
      ws: clientWs,
      lastActivity: Date.now(),
    };

    userConnections.push(connectionInfo);
    recordWSConnection(userId);

    const updateActivity = () => {
      connectionInfo.lastActivity = Date.now();
    };

    const upstreamWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime", {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    const clientBuffer: (string | Buffer)[] = [];
    let upstreamReady = false;
    let sessionCreatedReceived = false;
    let upstreamSessionId: string | null = null;
    let clientHeartbeat: NodeJS.Timeout | null = null;
    let upstreamHeartbeat: NodeJS.Timeout | null = null;

    // Tool call tracker for anti-hallucination enforcement
    const toolTracker = new ToolCallTracker();

    upstreamWs.on("open", () => {
      console.log("[VoiceProxy] Upstream OpenAI connection opened for user:", userId);
      // Don't send session.update yet - wait for session.created from OpenAI
    });

    upstreamWs.on("message", async (data) => {
      // Parse OpenAI messages to handle session.created and function calls
      try {
        const message = JSON.parse(data.toString());

        // Wait for session.created, then send our session.update
        if (message.type === "session.created" && !sessionCreatedReceived) {
          upstreamSessionId = message.session?.id || null;
          console.log(
            "[VoiceProxy] Received session.created from OpenAI, session ID:",
            upstreamSessionId,
          );
          sessionCreatedReceived = true;

          // PERFORMANCE: Send minimal session FIRST for immediate tool availability
          const minimalUpdate = await getMinimalSessionUpdate(userId);
          console.log("[VoiceProxy] Sending MINIMAL session.update (tools ready immediately):", {
            toolCount: (minimalUpdate.session as any).tools?.length || 0,
            voice: minimalUpdate.session.voice,
          });
          upstreamWs.send(JSON.stringify(minimalUpdate));
          upstreamReady = true;

          // Flush buffered client messages
          while (clientBuffer.length > 0) {
            const buffered = clientBuffer.shift();
            if (buffered) {
              // If it's a Buffer (binary audio), wrap it in JSON event with base64
              if (Buffer.isBuffer(buffered)) {
                const audioB64 = buffered.toString("base64");
                upstreamWs.send(
                  JSON.stringify({ type: "input_audio_buffer.append", audio: audioB64 }),
                );
              } else {
                // It's a string (JSON) - send as-is
                upstreamWs.send(buffered);
              }
            }
          }

          // Register voice session for callout streaming
          voiceCalloutBridge.registerSession(userId, clientWs, upstreamWs);

          // Start heartbeat
          upstreamHeartbeat = setInterval(() => {
            if (upstreamWs.readyState === WebSocket.OPEN) {
              upstreamWs.ping();
            }
          }, HEARTBEAT_INTERVAL);

          // PERFORMANCE: Backfill full context asynchronously (don't block session)
          setTimeout(async () => {
            try {
              const fullUpdate = await getInitialSessionUpdate(userId);
              if (upstreamWs.readyState === WebSocket.OPEN) {
                console.log("[VoiceProxy] Sending FULL context update (memories + knowledge)");
                upstreamWs.send(JSON.stringify(fullUpdate));
              }
            } catch (e) {
              console.warn("[VoiceProxy] Failed to send full context update:", e);
            }
          }, 250);
        }

        // Enhanced error logging with session ID and cooldown tracking
        if (message.type === "error" || message.type === "server_error") {
          console.error("[VoiceProxy][UpstreamError]", {
            sessionId: upstreamSessionId,
            userId,
            eventType: message.type,
            error: message.error || message,
          });

          // Track OpenAI errors and enter cooldown if threshold reached
          openaiErrorCount++;
          if (openaiErrorCount >= OPENAI_ERROR_THRESHOLD) {
            openaiCooldownUntil = Date.now() + OPENAI_COOLDOWN_MS;
            console.warn(
              `[VoiceProxy] ${OPENAI_ERROR_THRESHOLD} OpenAI errors detected. Entering ${OPENAI_COOLDOWN_MS / 60000}min cooldown.`,
            );

            // Notify client of cooldown
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: "error",
                  error: {
                    type: "cooldown",
                    message: `OpenAI voice service is experiencing issues. Entering 2-minute cooldown.`,
                    cooldownUntil: openaiCooldownUntil,
                  },
                }),
              );
            }

            // Close connections
            upstreamWs.close();
            clientWs.close(1008, "Service entering cooldown");
          }
        }

        // Reset error count on successful session update
        if (message.type === "session.updated") {
          openaiErrorCount = 0;
          openaiCooldownUntil = 0;
        }

        // Monitor response completion to detect hallucinations
        if (message.type === "response.completed") {
          const hasRecentTool = toolTracker.hasRecentToolCall();
          if (!hasRecentTool) {
            console.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.warn(
              "[ANTI-HALLUCINATION] ⚠️  Response completed WITHOUT tool call in last 3s",
            );
            console.warn(
              "[ANTI-HALLUCINATION] If response contained market numbers, it was likely HALLUCINATED",
            );
            console.warn("[ANTI-HALLUCINATION] User:", userId);
            console.warn("[ANTI-HALLUCINATION] Response ID:", message.response?.id || "unknown");
            console.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          } else {
            console.log(
              `[ANTI-HALLUCINATION] ✅ Response completed WITH fresh tool call - data is REAL`,
            );
          }
        }

        // Handle function calls from voice assistant
        if (message.type === "response.function_call_arguments.done") {
          const callId = message.call_id;
          const functionName = message.name;
          const argsString = message.arguments;

          // LEGACY INLINE TOOL EXECUTION - DISABLED
          // All tools now execute via client ToolBridge for consistent, predictable behavior
          // This provides better timeout control, circuit breaking, and observability
          const LEGACY_INLINE_EXECUTION = process.env.VOICE_INLINE_TOOLS === "true";

          if (LEGACY_INLINE_EXECUTION) {
            // Legacy path (deprecated - kept for emergency rollback only)
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.warn("[VOICE TOOL] ⚠️  LEGACY INLINE EXECUTION ENABLED");
            console.log(`[VOICE TOOL] Function: ${functionName}`);
            console.log(`[VOICE TOOL] Call ID: ${callId}`);
            console.log(`[VOICE TOOL] User: ${userId}`);

            try {
              const args = JSON.parse(argsString);
              let result: any = null;

              switch (functionName) {
                case "get_chart_snapshot":
                  result = await toolHandlers.get_chart_snapshot(args);
                  break;
                case "propose_entry_exit":
                  result = await toolHandlers.propose_entry_exit(args);
                  break;
                case "get_recommended_risk_box":
                  result = await toolHandlers.get_recommended_risk_box(args);
                  break;
                case "get_pattern_summary":
                  result = await toolHandlers.get_pattern_summary(args);
                  break;
                case "evaluate_rules":
                  result = await toolHandlers.evaluate_rules({
                    context: { ...args, userId },
                  });
                  break;
                case "log_journal_event":
                  result = await toolHandlers.log_journal_event({
                    type: args.type,
                    payload: { ...args, userId },
                  });

                  // Auto-capture insights to memory
                  if (args.reasoning) {
                    if (args.qualityGrade === "A" && args.decision === "accept") {
                      await voiceMemoryBridge.captureSetupLearning(
                        userId,
                        args.symbol,
                        args.timeframe,
                        args.reasoning,
                      );
                    }

                    if (
                      args.decision === "reject" ||
                      args.reasoning.toLowerCase().includes("mistake")
                    ) {
                      await voiceMemoryBridge.captureMistake(
                        userId,
                        args.reasoning,
                        `Avoided on ${args.symbol}`,
                      );
                    }

                    const patternWarning = await traderPatternDetector.checkForPattern(
                      userId,
                      args.symbol,
                      args.decision,
                      args.reasoning,
                    );

                    if (patternWarning) {
                      upstreamWs.send(
                        JSON.stringify({
                          type: "conversation.item.create",
                          item: {
                            type: "message",
                            role: "user",
                            content: [{ type: "input_text", text: patternWarning }],
                          },
                        }),
                      );
                    }
                  }
                  break;
                case "generate_trade_plan":
                  result = await toolHandlers.generate_trade_plan(args);
                  break;
                default:
                  result = { error: `Unknown function: ${functionName}` };
              }

              toolTracker.markToolCalled();

              upstreamWs.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify(result),
                  },
                }),
              );

              upstreamWs.send(JSON.stringify({ type: "response.create" }));
              console.log(`[VOICE TOOL] ✅ Response sent (legacy path)`);
              console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            } catch (error) {
              console.error("[VoiceProxy] Function call error:", {
                userId,
                functionName,
                error: error instanceof Error ? error.message : "Unknown error",
              });

              upstreamWs.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify({
                      error: error instanceof Error ? error.message : "Unknown error",
                      functionName,
                      timestamp: Date.now(),
                    }),
                  },
                }),
              );
              upstreamWs.send(JSON.stringify({ type: "response.create" }));
            }
          } else {
            // MODERN PATH: Client executes via ToolBridge
            // Just log the tool call for observability, client will execute
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("[VOICE TOOL] 📋 Tool call forwarded to client ToolBridge");
            console.log(`[VOICE TOOL] Function: ${functionName}`);
            console.log(`[VOICE TOOL] Call ID: ${callId}`);
            console.log(`[VOICE TOOL] User: ${userId}`);
            console.log(`[VOICE TOOL] Client will execute via /ws/tools with adaptive timeout`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            // Mark tool as called for anti-hallucination tracking
            toolTracker.markToolCalled();
          }
        }
      } catch (err) {
        console.error("[VoiceProxy] Error parsing OpenAI message:", err);
      }

      // Forward all messages to client
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    });

    upstreamWs.on("error", (error) => {
      console.error("[VoiceProxy] Upstream WebSocket error:", {
        message: error.message,
        userId,
        stack: error.stack,
      });
      clientWs.close(1011, "Upstream error");
    });

    upstreamWs.on("close", (code, reason) => {
      console.log("[VoiceProxy] Upstream OpenAI connection closed:", {
        code,
        reason: reason.toString(),
        userId,
      });
      clientWs.close();
      if (upstreamHeartbeat) clearInterval(upstreamHeartbeat);
    });

    clientWs.on("message", (data, isBinary) => {
      updateActivity();
      if (upstreamReady && upstreamWs.readyState === WebSocket.OPEN) {
        // Defensive: if binary data arrives, wrap it in JSON event with base64 audio
        if (isBinary && Buffer.isBuffer(data)) {
          const audioB64 = (data as Buffer).toString("base64");
          upstreamWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: audioB64 }));
          return;
        }
        // Text/JSON path - send as-is
        upstreamWs.send(data);
      } else {
        // Buffer messages until upstream is ready
        // Preserve binary data as Buffer, text data as string
        if (isBinary && Buffer.isBuffer(data)) {
          clientBuffer.push(data);
        } else {
          clientBuffer.push(data.toString());
        }
      }
    });

    clientWs.on("error", (error) => {
      console.error("[VoiceProxy] Client WebSocket error:", {
        message: error.message,
        userId,
        readyState: clientWs.readyState,
      });
    });

    clientWs.on("close", (code) => {
      upstreamWs.close();
      voiceCalloutBridge.unregisterSession(userId);

      const index = userConnections.findIndex((conn) => conn.ws === clientWs);
      if (index !== -1) {
        userConnections.splice(index, 1);
      }

      if (userConnections.length === 0) {
        activeConnections.delete(userId);
      }

      const reason = code === 1000 ? "normal" : code === 1008 ? "unauthorized" : "error";
      recordWSDisconnection(userId, reason);

      if (clientHeartbeat) clearInterval(clientHeartbeat);
      if (upstreamHeartbeat) clearInterval(upstreamHeartbeat);
    });

    clientHeartbeat = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.ping();
      }
    }, HEARTBEAT_INTERVAL);
  });

  return wss;
}
