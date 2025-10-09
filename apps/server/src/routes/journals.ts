import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  addJournalEntry,
  listJournals,
  getJournal,
  updateJournal,
  deleteJournal,
  linkJournalToSignal,
} from '../journals/service.js';
import { generateEodSummary, formatEodSummary } from '../journals/eod.js';

const router: Router = Router();

const CreateJournalSchema = z.object({
  text: z.string().optional(),
  tradeJson: z.record(z.unknown()).optional(),
  links: z.array(z.string()).optional(),
});

const ListJournalsSchema = z.object({
  date: z.string().optional(),
});

router.post('/', async (req, res) => {
  try {
    const parsed = CreateJournalSchema.parse(req.body);
    const userId = 'demo-user';

    const content = parsed.text ?? parsed.tradeJson;
    if (!content) {
      return res.status(400).json({ error: 'Either text or tradeJson is required' });
    }

    const today = new Date().toISOString().split('T')[0] ?? '';
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
    console.error('Failed to create journal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const parsed = ListJournalsSchema.parse(req.query);
    const userId = 'demo-user';

    const options = parsed.date ? { date: parsed.date } : {};
    const journals = await listJournals(userId, options);

    res.json({ journals });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Failed to list journals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const userId = 'demo-user';
    const { id } = req.params;

    const journal = await getJournal(userId, id);

    if (!journal) {
      return res.status(404).json({ error: 'Journal not found' });
    }

    res.json({ journal });
  } catch (error) {
    console.error('Failed to get journal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const parsed = CreateJournalSchema.parse(req.body);
    const userId = 'demo-user';
    const { id } = req.params;

    const content = parsed.text ?? parsed.tradeJson;
    if (!content) {
      return res.status(400).json({ error: 'Either text or tradeJson is required' });
    }

    await updateJournal(userId, id, content);

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Failed to update journal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const userId = 'demo-user';
    const { id } = req.params;

    await deleteJournal(userId, id);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete journal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/eod/preview', async (req, res) => {
  try {
    const userId = 'demo-user';
    const today = new Date().toISOString().split('T')[0] ?? '';

    const summary = await generateEodSummary(userId, today);
    const markdown = formatEodSummary(summary);

    res.json({ summary, markdown });
  } catch (error) {
    console.error('Failed to generate EOD preview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
