import { Router } from 'express';
import { toolbelt } from './state';
import { onCoach } from './state';
import type { AppEvent } from './types';

export function buildAgentRouter() {
  const r = Router();

  // Push events from anywhere in your server (or even the client) into the coach
  r.post('/event', async (req, res) => {
    const ev = req.body as AppEvent;
    if (!ev || typeof ev !== 'object' || !('type' in ev)) return res.status(400).json({ error: 'Invalid event' });
    toolbelt.pushEvent(ev);
    res.json({ ok: true });
  });

  // Pull a consolidated snapshot (charts+metrics+journalTail)
  r.get('/snapshot', (req, res) => {
    res.json(toolbelt.getSnapshot());
  });

  // Stream coach messages (Server-Sent Events)
  r.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // send a hello + initial backlog
    const backlog = toolbelt.listCoachMessages(Date.now() - 5 * 60_000);
    for (const m of backlog) {
      res.write(`event: coach\n`);
      res.write(`data: ${JSON.stringify(m)}\n\n`);
    }

    const off = onCoach((m) => {
      res.write(`event: coach\n`);
      res.write(`data: ${JSON.stringify(m)}\n\n`);
    });

    req.on('close', () => off());
  });

  return r;
}
