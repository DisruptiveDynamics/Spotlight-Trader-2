import cron from 'node-cron';
import { db } from '../db/index.js';
import { signals } from '../db/schema.js';
import { eq, and, gte, lt } from 'drizzle-orm';
import { addJournalEntry, linkJournalToSignal } from './service.js';
import { getRuleScore, getRuleMetrics } from '../learning/loop.js';

export interface SignalSummary {
  signalId: string;
  ruleId: string;
  symbol: string;
  time: string;
  confidence: number;
  expectancy: number;
  acted?: boolean;
}

export interface EodSummary {
  date: string;
  signalsFired: number;
  allSignals: SignalSummary[];
  topSignals: SignalSummary[];
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

  // Calculate expectancy: confidence × rule score (from learning loop)
  const signalsWithExpectancy = await Promise.all(
    daySignals.map(async (s) => {
      const ruleScore = await getRuleScore(userId, s.ruleId);
      const expectancy = s.confidence * (ruleScore + 1) * 0.5; // Normalize to [0, 1]

      return {
        signalId: s.id,
        ruleId: s.ruleId,
        symbol: s.symbol,
        time: new Date(s.ts).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        confidence: s.confidence,
        expectancy,
        acted: false, // TODO: Link to actual trades when available
      };
    })
  );

  // Keep original chronological order for the table
  const allSignals = signalsWithExpectancy;
  
  // Sort by expectancy for top 3
  const sortedByExpectancy = [...signalsWithExpectancy].sort((a, b) => b.expectancy - a.expectancy);
  const topSignals = sortedByExpectancy.slice(0, 3);

  const drift: string[] = [];
  if (daySignals.length < 3) {
    drift.push('Low signal volume - check if rules are too strict');
  }

  // Check for rules that fired but may have been softened/refused by RiskGovernor
  const lowConfidenceSignals = daySignals.filter((s) => s.confidence < 0.4);
  if (lowConfidenceSignals.length > 0) {
    drift.push(
      `${lowConfidenceSignals.length} signals had low confidence (<40%) - possible RiskGovernor intervention`
    );
  }

  // Collect rule metrics for keep/stop/try recommendations
  const uniqueRules = [...new Set(daySignals.map((s) => s.ruleId))];
  const ruleMetrics = await Promise.all(
    uniqueRules.map((ruleId) => getRuleMetrics(userId, ruleId))
  );

  const keepStopTry = {
    keep: ruleMetrics
      .filter((m) => m.score > 0.3 && m.actionable7d > 0)
      .map((m) => `Rule with score ${m.score.toFixed(2)} (${m.good7d} good, ${m.bad7d} bad in 7d)`)
      .slice(0, 3),
    stop: ruleMetrics
      .filter((m) => m.score < -0.3 && m.actionable7d > 0)
      .map((m) => `Rule with score ${m.score.toFixed(2)} (${m.good7d} good, ${m.bad7d} bad in 7d)`)
      .slice(0, 3),
    try: [
      'Review rules with neutral scores (±0.3) for potential improvements',
      'Adjust confidence thresholds if signal density is too low/high',
    ],
  };

  // Add defaults if empty
  if (keepStopTry.keep.length === 0) {
    keepStopTry.keep.push('No rules with sufficient positive performance yet');
  }
  if (keepStopTry.stop.length === 0) {
    keepStopTry.stop.push('No rules with significant losses identified');
  }

  return {
    date,
    signalsFired: daySignals.length,
    allSignals,
    topSignals,
    drift,
    keepStopTry,
  };
}

export function formatEodSummary(summary: EodSummary): string {
  const lines: string[] = [];

  lines.push(`# EOD – ${summary.date}`);
  lines.push('');
  lines.push(`**Signals Fired:** ${summary.signalsFired}`);
  lines.push('');

  lines.push('## Signals Fired');
  lines.push('');
  lines.push('| Time | Symbol | Rule | Confidence | Acted |');
  lines.push('|------|--------|------|-----------|-------|');

  summary.allSignals.forEach((sig) => {
    const acted = sig.acted ? '✓' : '—';
    lines.push(
      `| ${sig.time} | ${sig.symbol} | ${sig.ruleId.substring(0, 8)}… | ${(sig.confidence * 100).toFixed(0)}% | ${acted} |`
    );
  });

  if (summary.allSignals.length === 0) {
    lines.push('| — | — | — | — | — |');
  }

  lines.push('');

  lines.push('## Top 3 by Expectancy');
  lines.push('');
  summary.topSignals.slice(0, 3).forEach((sig, idx) => {
    lines.push(
      `${idx + 1}. **${sig.symbol}** @ ${sig.time} — Confidence ${(sig.confidence * 100).toFixed(0)}%, Expectancy ${sig.expectancy.toFixed(2)}`
    );
  });

  if (summary.topSignals.length === 0) {
    lines.push('_No signals today_');
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
