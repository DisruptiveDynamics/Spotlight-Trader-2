import express, { type Router } from "express";
import { voiceTools } from "../voice/tools";

const router: Router = express.Router();

function shortId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function safeJson(obj: any, len = 2000): string {
  try {
    const s = JSON.stringify(obj);
    return s.length > len ? s.slice(0, len) + "...<truncated>" : s;
  } catch {
    return String(obj);
  }
}

/**
 * Debug endpoint to test voice tool execution without needing full voice connection
 * POST /debug/voice-tool-test
 * Body: { toolName?: string, input?: any }
 */
router.post("/voice-tool-test", async (req, res) => {
  const testId = shortId();
  const { toolName = "get_last_price", input = { symbol: "SPY" } } = req.body ?? {};
  const logs: any[] = [];

  // Helper logger that pushes entries to the response payload
  function L(level: "info" | "warn" | "error", msg: string, obj?: any) {
    const entry = {
      time: new Date().toISOString(),
      level,
      msg,
      detail: obj ? safeJson(obj, 1000) : undefined,
    };
    logs.push(entry);
    if (level === "error") console.error("[voice-debug]", msg, obj);
    else if (level === "warn") console.warn("[voice-debug]", msg, obj);
    else console.info("[voice-debug]", msg, obj);
  }

  try {
    L("info", "Starting voice-tool-test", { testId, toolName, input });

    // Check if tool exists
    const toolHandler = (voiceTools as any)[toolName];
    if (!toolHandler || typeof toolHandler !== "function") {
      L("error", "Tool not found", { 
        toolName, 
        availableTools: Object.keys(voiceTools) 
      });
      return res.status(400).json({ 
        ok: false, 
        error: `Tool '${toolName}' not found`,
        availableTools: Object.keys(voiceTools),
        logs 
      });
    }

    // Build a test event that mimics the real event
    const ev: any = { 
      id: `debug-${testId}`, 
      tool: toolName, 
      name: toolName,
      args: input 
    };

    L("info", "Tool found, preparing to execute", { 
      toolName,
      inputPreview: safeJson(input, 300) 
    });

    // Execute the tool
    const startTime = Date.now();
    let toolResult: any;
    try {
      toolResult = await toolHandler(input, "debug-user");
      const latency = Date.now() - startTime;
      L("info", "Tool execution completed", {
        latency,
        resultPreview: safeJson(toolResult, 500),
      });
    } catch (toolErr: any) {
      const latency = Date.now() - startTime;
      L("error", "Tool execution failed", {
        latency,
        error: toolErr?.message || String(toolErr),
        stack: toolErr?.stack,
      });
      return res.status(500).json({ ok: false, error: "Tool execution failed", logs });
    }

    // Now we simulate what the client would do - try to submit result back to OpenAI
    // We can't actually submit to OpenAI from here, but we can log what would be sent
    const payload = {
      call_id: ev.id,
      output: JSON.stringify(toolResult),
    };

    L("info", "Would submit to OpenAI (simulation)", {
      callId: ev.id,
      payloadSize: payload.output.length,
      payloadPreview: safeJson(toolResult, 300),
      note: "In real flow, this would be sent via s.response.function_call.output.create()",
    });

    L("info", "Debug cycle completed successfully", { testId });

    res.json({
      ok: true,
      testId,
      toolName,
      result: toolResult,
      logs,
      summary: {
        toolExecuted: true,
        payloadSize: payload.output.length,
        logsCount: logs.length,
      },
    });
  } catch (err: any) {
    L("error", "Unhandled debug error", {
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({ ok: false, error: "Debug test failed", logs });
  }
});

/**
 * Test endpoint to verify tool availability
 * GET /debug/voice-tools
 */
router.get("/voice-tools", (_req, res) => {
  const tools = Object.keys(voiceTools).map((name) => ({
    name,
    type: typeof (voiceTools as any)[name],
  }));

  res.json({
    ok: true,
    count: tools.length,
    tools,
  });
});

export const voiceDebugRouter = router;
