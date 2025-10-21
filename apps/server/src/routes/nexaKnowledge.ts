import type { Express, Request, Response } from "express";
import multer, { type FileFilterCallback } from "multer";

import { uploadKnowledge, getUserUploads } from "../knowledge/uploader.js";
import { requirePin } from "../middleware/requirePin";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Allow PDF files only
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

export function setupNexaKnowledgeRoutes(app: Express) {
  // POST /api/nexa/upload/youtube - Upload YouTube video transcript
  app.post("/api/nexa/upload/youtube", requirePin, async (req: Request, res: Response) => {
    try {
      const { url, title, tags } = req.body;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "YouTube URL is required" });
      }

      const userId = (req as any).userId || "owner";

      const result = await uploadKnowledge({
        userId,
        sourceType: "youtube",
        source: url,
        title,
        tags,
      });

      if (result.status === "failed") {
        return res.status(500).json({
          error: result.error || "Failed to process YouTube video",
        });
      }

      res.json({
        success: true,
        uploadId: result.uploadId,
        chunksCreated: result.chunksCreated,
        totalTokens: result.totalTokens,
      });
    } catch (error) {
      console.error("YouTube upload error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // POST /api/nexa/upload/pdf - Upload PDF document
  app.post("/api/nexa/upload/pdf", requirePin, upload.single("file"), async (req, res) => {
    const multerReq = req as MulterRequest;
    try {
      if (!multerReq.file) {
        return res.status(400).json({ error: "PDF file is required" });
      }

      const { title, tags } = multerReq.body;
      const userId = (multerReq as any).userId || "owner";

      const result = await uploadKnowledge({
        userId,
        sourceType: "pdf",
        source: multerReq.file.buffer,
        title: title || multerReq.file.originalname,
        tags: tags ? JSON.parse(tags) : [],
      });

      if (result.status === "failed") {
        return res.status(500).json({
          error: result.error || "Failed to process PDF",
        });
      }

      res.json({
        success: true,
        uploadId: result.uploadId,
        chunksCreated: result.chunksCreated,
        totalTokens: result.totalTokens,
      });
    } catch (error) {
      console.error("PDF upload error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // POST /api/nexa/upload/text - Upload raw text notes
  app.post("/api/nexa/upload/text", requirePin, async (req: Request, res: Response) => {
    try {
      const { text, title, tags } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Text content is required" });
      }

      if (text.length < 50) {
        return res.status(400).json({ error: "Text must be at least 50 characters" });
      }

      const userId = (req as any).userId || "owner";

      const result = await uploadKnowledge({
        userId,
        sourceType: "text",
        source: text,
        title,
        tags,
      });

      if (result.status === "failed") {
        return res.status(500).json({
          error: result.error || "Failed to process text",
        });
      }

      res.json({
        success: true,
        uploadId: result.uploadId,
        chunksCreated: result.chunksCreated,
        totalTokens: result.totalTokens,
      });
    } catch (error) {
      console.error("Text upload error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // GET /api/nexa/uploads - Get upload history
  app.get("/api/nexa/uploads", requirePin, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId || "owner";
      const uploads = await getUserUploads(userId);

      res.json({ uploads });
    } catch (error) {
      console.error("Get uploads error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });
}
