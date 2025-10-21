import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import {
  saveMemory,
  listMemories,
  retrieveTopK,
  deleteMemory,
  type MemoryKind,
} from "../memory/store.js";
import { requirePin } from "../middleware/requirePin";

const router: Router = Router();

const SaveMemorySchema = z.object({
  kind: z.enum(["playbook", "glossary", "postmortem"]),
  text: z.string(),
  tags: z.array(z.string()),
});

const ListMemoriesSchema = z.object({
  kind: z.enum(["playbook", "glossary", "postmortem"]).optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().optional(),
});

const SearchMemoriesSchema = z.object({
  q: z.string(),
  k: z.coerce.number().optional(),
});

router.post("/", requirePin, async (req: Request, res: Response) => {
  try {
    const parsed = SaveMemorySchema.parse(req.body);
    const userId = (req as any).userId;

    const id = await saveMemory(userId, parsed.kind, parsed.text, parsed.tags);

    res.json({ id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Failed to save memory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", requirePin, async (req: Request, res: Response) => {
  try {
    const parsed = ListMemoriesSchema.parse(req.query);
    const userId = (req as any).userId;

    const options: { kind?: MemoryKind; limit?: number; tag?: string } = {};
    if (parsed.kind) options.kind = parsed.kind;
    if (parsed.limit) options.limit = parsed.limit;
    if (parsed.tag) options.tag = parsed.tag;

    const memories = await listMemories(userId, options);

    res.json({ memories });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Failed to list memories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/search", requirePin, async (req: Request, res: Response) => {
  try {
    const parsed = SearchMemoriesSchema.parse(req.query);
    const userId = (req as any).userId;

    const k = parsed.k ?? 4;
    const memories = await retrieveTopK(userId, parsed.q, k);

    res.json({ memories });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Failed to search memories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requirePin, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "ID required" });

    await deleteMemory(userId, id);

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete memory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
