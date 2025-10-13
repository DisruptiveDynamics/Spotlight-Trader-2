import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { voiceTools } from "./tools";
import { randomUUID } from "crypto"; // [RESILIENCE] For correlation IDs
import { recordToolExecution } from "./toolMetrics"; // [OBS] Metrics tracking

type ToolExecRequest = {
  type: "tool.exec";
  id: string;
  name: string;
  args: Record<string, unknown>;
  corrId?: string; // [OBS] Optional correlation ID from client
};

type ToolExecResponse =
  | { type: "tool.result"; id: string; ok: true; output: unknown; latency_ms: number; corrId: string }
  | { type: "tool.result"; id: string; ok: false; error: string; latency_ms: number; corrId: string };

export function setupToolsBridge(httpServer: Server) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    if (!req.url?.startsWith("/ws/tools")) return;

    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token") ?? "";

    try {
      const decoded = jwt.verify(token, process.env.AUTH_JWT_SECRET || "dev-secret");
      const userId = (decoded as any).userId;

      wss.handleUpgrade(req, socket as any, head, (ws) => {
        console.log("[ToolsBridge] Client connected, userId:", userId);
        wss.emit("connection", ws, { userId });
      });
    } catch (err) {
      console.error("[ToolsBridge] Auth failed:", err);
      socket.destroy();
    }
  });

  wss.on("connection", (ws, context: any) => {
    const userId = context?.userId || "demo-user";

    ws.on("message", async (buf) => {
      let msg: ToolExecRequest;
      try {
        msg = JSON.parse(String(buf));
      } catch {
        return;
      }

      if (msg.type !== "tool.exec") return;

      // [OBS] Generate or use provided correlation ID for tracing
      const corrId = msg.corrId || randomUUID();
      
      const started = performance.now();
      console.log(`[ToolsBridge] [${corrId}] Executing tool: ${msg.name}`, msg.args);

      try {
        // [RESILIENCE] Wrap tool execution with timeout
        const output = await Promise.race([
          dispatchTool(msg.name, msg.args, userId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Tool execution timeout")), 5000)
          )
        ]);
        
        const latency = Math.round(performance.now() - started);

        const response: ToolExecResponse = {
          type: "tool.result",
          id: msg.id,
          ok: true,
          output,
          latency_ms: latency,
          corrId,
        };

        console.log(`[ToolsBridge] [${corrId}] Tool ${msg.name} succeeded in ${latency}ms`);
        recordToolExecution(msg.name, latency, true); // [OBS] Record success
        ws.send(JSON.stringify(response));
      } catch (e: any) {
        const latency = Math.round(performance.now() - started);

        const response: ToolExecResponse = {
          type: "tool.result",
          id: msg.id,
          ok: false,
          error: e?.message ?? "tool execution failed",
          latency_ms: latency,
          corrId,
        };

        console.error(`[ToolsBridge] [${corrId}] Tool ${msg.name} failed:`, e.message);
        recordToolExecution(msg.name, latency, false); // [OBS] Record failure
        ws.send(JSON.stringify(response));
      }
    });

    ws.on("close", () => {
      console.log("[ToolsBridge] Client disconnected");
    });

    ws.on("error", (err) => {
      console.error("[ToolsBridge] WebSocket error:", err);
    });
  });

  console.log("✅ Tools Bridge WebSocket mounted at /ws/tools");
}

// [RESILIENCE] Cap tool response payload to prevent memory/bandwidth issues
const MAX_PAYLOAD_BYTES = 80 * 1024; // 80KB

function capPayload(output: any): any {
  const json = JSON.stringify(output);
  const byteSize = Buffer.byteLength(json, 'utf8');
  
  if (byteSize <= MAX_PAYLOAD_BYTES) {
    return output;
  }
  
  // Truncate and add metadata
  console.warn(`[ToolsBridge] Payload exceeds ${MAX_PAYLOAD_BYTES} bytes (${byteSize}), truncating`);
  
  const truncated = json.slice(0, MAX_PAYLOAD_BYTES);
  return {
    truncated: true,
    originalSize: byteSize,
    data: truncated,
    message: `Response truncated from ${byteSize} to ${MAX_PAYLOAD_BYTES} bytes`,
  };
}

async function dispatchTool(name: string, args: Record<string, unknown>, userId: string) {
  const tool = (voiceTools as any)[name];

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const result = await tool(args, userId);
  return capPayload(result); // [RESILIENCE] Enforce payload cap
}
