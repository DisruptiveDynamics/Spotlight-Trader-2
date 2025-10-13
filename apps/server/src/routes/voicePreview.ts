import { Router, type Router as ExpressRouter } from "express";

const router: ExpressRouter = Router();

const PREVIEW_TEXT = "Hey there! This is what I sound like. Ready to crush the markets together?";

// GET /api/voice/preview?voice={voiceId}
router.get("/preview", async (req, res) => {
  const voice = req.query.voice as string;

  if (!voice) {
    return res.status(400).json({ error: "Voice parameter required" });
  }

  const validVoices = ["alloy", "echo", "shimmer", "fable", "onyx", "nova"];
  if (!validVoices.includes(voice)) {
    return res.status(400).json({ error: "Invalid voice" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: voice,
        input: PREVIEW_TEXT,
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS failed: ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.byteLength.toString());
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error("Voice preview error:", error);
    res.status(500).json({ error: "Failed to generate voice preview" });
  }
});

export default router;
