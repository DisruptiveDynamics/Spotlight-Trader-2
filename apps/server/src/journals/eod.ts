import cron from 'node-cron';
import { db } from '../db/index.js';
import { signals } from '../db/schema.js';
import { eq, and, gte, lt } from 'drizzle-orm';
import { addJournalEntry, linkJournalToSignal } from './service.js';

export interface EodSummary {
  date: string;
  signalsFired: number;
  topSignals: Array<{
    signalId: string;
    ruleId: string;
    confidence: number;
    expectancy: number;
  }>;
  drift: string[];
  keepStopTry: {
    keep: string[];
    stop: string[];
    try: string[];
  };
}

export async function generateEodSummary(userId: string, date: string): Promise<EodSummary> {
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);

  const dateEnd = new Date(date);
  dateEnd.setHours(23, 59, 59, 999);

  const daySignals = await db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, userId), gte(signals.ts, dateStart), lt(signals.ts, dateEnd)))
    .orderBy(signals.ts);

  const topSignals = daySignals
    .map((s) => ({
      signalId: s.id,
      ruleId: s.ruleId,
      confidence: s.confidence,
      expectancy: s.confidence * 0.5,
    }))
    .sort((a, b) => b.expectancy - a.expectancy)
    .slice(0, 3);

  const drift: string[] = [];
  if (daySignals.length < 3) {
    drift.push('Low signal volume - check if rules are too strict');
  }

  const keepStopTry = {
    keep: ['Top performing rules with >0.6 confidence'],
    stop: ['Rules that fired but resulted in losses'],
    try: ['Adjust thresholds if signals are too conservative'],
  };

  return {
    date,
    signalsFired: daySignals.length,
    topSignals,
    drift,
    keepStopTry,
  };
}

export function formatEodSummary(summary: EodSummary): string {
  const lines: string[] = [];

  lines.push(`# End of Day Summary - ${summary.date}`);
  lines.push('');
  lines.push(`**Signals Fired:** ${summary.signalsFired}`);
  lines.push('');

  lines.push('## Top 3 Signals by Expectancy');
  lines.push('');
  lines.push('| Rule ID | Confidence | Expectancy |');
  lines.push('|---------|-----------|------------|');

  summary.topSignals.forEach((sig) => {
    lines.push(
      `| ${sig.ruleId} | ${(sig.confidence * 100).toFixed(0)}% | ${sig.expectancy.toFixed(2)} |`
    );
  });

  if (summary.topSignals.length === 0) {
    lines.push('| No signals | - | - |');
  }

  lines.push('');

  if (summary.drift.length > 0) {
    lines.push('## Drift Notes');
    lines.push('');
    summary.drift.forEach((note) => {
      lines.push(`- ${note}`);
    });
    lines.push('');
  }

  lines.push('## Keep / Stop / Try');
  lines.push('');
  lines.push('**Keep:**');
  summary.keepStopTry.keep.forEach((item) => {
    lines.push(`- ${item}`);
  });
  lines.push('');
  lines.push('**Stop:**');
  summary.keepStopTry.stop.forEach((item) => {
    lines.push(`- ${item}`);
  });
  lines.push('');
  lines.push('**Try:**');
  summary.keepStopTry.try.forEach((item) => {
    lines.push(`- ${item}`);
  });

  return lines.join('\n');
}

export async function runEodForUser(userId: string, date: string): Promise<string> {
  const summary = await generateEodSummary(userId, date);
  const markdown = formatEodSummary(summary);

  const journalId = await addJournalEntry(userId, date, markdown);

  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);

  const dateEnd = new Date(date);
  dateEnd.setHours(23, 59, 59, 999);

  const daySignals = await db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, userId), gte(signals.ts, dateStart), lt(signals.ts, dateEnd)));

  for (const signal of daySignals) {
    await linkJournalToSignal(journalId, signal.id);
  }

  return journalId;
}

export function startEodScheduler(): void {
  if (process.env.NODE_ENV === 'test') {
    console.log('EOD scheduler disabled in test environment');
    return;
  }

  cron.schedule(
    '30 59 15 * * *',
    async () => {
      console.log('Running EOD summary generation');

      const today = new Date().toISOString().split('T')[0] ?? '';

      try {
        const journalId = await runEodForUser('demo-user', today);
        console.log(`EOD summary generated: ${journalId}`);
      } catch (error) {
        console.error('EOD summary generation failed:', error);
      }
    },
    {
      timezone: 'America/New_York',
    }
  );

  console.log('EOD scheduler started (15:59:30 America/New_York)');
}
