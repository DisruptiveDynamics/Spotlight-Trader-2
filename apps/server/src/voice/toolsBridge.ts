import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { voiceTools } from "./tools";

type ToolExecRequest = {
  type: "tool.exec";
  id: string;
  name: string;
  args: Record<string, unknown>;
};

type ToolExecResponse =
  | { type: "tool.result"; id: string; ok: true; output: unknown; latency_ms: number }
  | { type: "tool.result"; id: string; ok: false; error: string; latency_ms: number };

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

      const started = performance.now();
      console.log(`[ToolsBridge] Executing tool: ${msg.name}`, msg.args);

      try {
        const output = await dispatchTool(msg.name, msg.args, userId);
        const latency = Math.round(performance.now() - started);

        const response: ToolExecResponse = {
          type: "tool.result",
          id: msg.id,
          ok: true,
          output,
          latency_ms: latency,
        };

        console.log(`[ToolsBridge] Tool ${msg.name} succeeded in ${latency}ms`);
        ws.send(JSON.stringify(response));
      } catch (e: any) {
        const latency = Math.round(performance.now() - started);

        const response: ToolExecResponse = {
          type: "tool.result",
          id: msg.id,
          ok: false,
          error: e?.message ?? "tool execution failed",
          latency_ms: latency,
        };

        console.error(`[ToolsBridge] Tool ${msg.name} failed:`, e.message);
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

async function dispatchTool(name: string, args: Record<string, unknown>, userId: string) {
  const tool = (voiceTools as any)[name];

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool(args, userId);
}
