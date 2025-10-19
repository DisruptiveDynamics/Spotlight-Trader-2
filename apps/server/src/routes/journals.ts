import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";

import { generateEodSummary, formatEodSummary } from "../journals/eod.js";
import {
  addJournalEntry,
  listJournals,
  getJournal,
  updateJournal,
  deleteJournal,
  linkJournalToSignal,
} from "../journals/service.js";
import { requirePin } from "../middleware/requirePin";

const router: Router = Router();

const CreateJournalSchema = z.object({
  text: z.string().optional(),
  tradeJson: z.record(z.unknown()).optional(),
  links: z.array(z.string()).optional(),
});

const ListJournalsSchema = z.object({
  date: z.string().optional(),
});

router.post("/", requirePin, async (req: Request, res: Response) => {
  try {
    const parsed = CreateJournalSchema.parse(req.body);
    const userId = (req as any).userId;

    const content = parsed.text ?? parsed.tradeJson;
    if (!content) {
      return res.status(400).json({ error: "Either text or tradeJson is required" });
    }

    const today = new Date().toISOString().split("T")[0] ?? "";
    const journalId = await addJournalEntry(userId, today, content);

    if (parsed.links) {
      for (const signalId of parsed.links) {
        await linkJournalToSignal(journalId, signalId);
      }
    }

    res.json({ journalId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Failed to create journal:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", requirePin, async (req: Request, res: Response) => {
  try {
    const parsed = ListJournalsSchema.parse(req.query);
    const userId = (req as any).userId;

    const options = parsed.date ? { date: parsed.date } : {};
    const journals = await listJournals(userId, options);

    res.json({ journals });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Failed to list journals:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", requirePin, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "ID required" });

    const journal = await getJournal(userId, id);

    if (!journal) {
      return res.status(404).json({ error: "Journal not found" });
    }

    res.json({ journal });
  } catch (error) {
    console.error("Failed to get journal:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requirePin, async (req: Request, res: Response) => {
  try {
    const parsed = CreateJournalSchema.parse(req.body);
    const userId = (req as any).userId;
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "ID required" });

    const content = parsed.text ?? parsed.tradeJson;
    if (!content) {
      return res.status(400).json({ error: "Either text or tradeJson is required" });
    }

    await updateJournal(userId, id, content);

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Failed to update journal:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requirePin, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "ID required" });

    await deleteJournal(userId, id);

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete journal:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/eod/preview", requirePin, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const today = new Date().toISOString().split("T")[0] ?? "";

    const summary = await generateEodSummary(userId, today);
    const markdown = formatEodSummary(summary);

    res.json({ summary, markdown });
  } catch (error) {
    console.error("Failed to generate EOD preview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
