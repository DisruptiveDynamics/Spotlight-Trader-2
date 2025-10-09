import { db } from '../db/index.js';
import { journals, journalLinks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { JournalEntry, JournalLink } from './model.js';

export async function addJournalEntry(
  userId: string,
  date: string,
  textOrJson: string | object
): Promise<string> {
  const id = nanoid();
  const markdown =
    typeof textOrJson === 'string' ? textOrJson : JSON.stringify(textOrJson, null, 2);

  await db.insert(journals).values({
    id,
    userId,
    date,
    markdown,
  });

  return id;
}

export async function linkJournalToSignal(journalId: string, signalId: string): Promise<string> {
  const id = nanoid();

  await db.insert(journalLinks).values({
    id,
    journalId,
    linkType: 'signal',
    linkId: signalId,
  });

  return id;
}

export async function listJournals(
  userId: string,
  options?: { date?: string }
): Promise<JournalEntry[]> {
  const conditions = [eq(journals.userId, userId)];

  if (options?.date) {
    conditions.push(eq(journals.date, options.date));
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

  const results = await db.select().from(journals).where(whereClause).orderBy(journals.date);

  return results.map((row) => ({
    id: row.id,
    userId: row.userId,
    date: row.date,
    markdown: row.markdown,
  }));
}

export async function getJournal(userId: string, journalId: string): Promise<JournalEntry | null> {
  const results = await db
    .select()
    .from(journals)
    .where(and(eq(journals.id, journalId), eq(journals.userId, userId)))
    .limit(1);

  if (results.length === 0 || !results[0]) {
    return null;
  }

  const row = results[0];
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    markdown: row.markdown,
  };
}

export async function updateJournal(
  userId: string,
  journalId: string,
  textOrJson: string | object
): Promise<boolean> {
  const markdown =
    typeof textOrJson === 'string' ? textOrJson : JSON.stringify(textOrJson, null, 2);

  const result = await db
    .update(journals)
    .set({ markdown })
    .where(and(eq(journals.id, journalId), eq(journals.userId, userId)));

  return true;
}

export async function deleteJournal(userId: string, journalId: string): Promise<boolean> {
  await db.delete(journalLinks).where(eq(journalLinks.journalId, journalId));

  await db.delete(journals).where(and(eq(journals.id, journalId), eq(journals.userId, userId)));

  return true;
}

export async function getJournalLinks(journalId: string): Promise<JournalLink[]> {
  const results = await db.select().from(journalLinks).where(eq(journalLinks.journalId, journalId));

  return results.map((row) => ({
    id: row.id,
    journalId: row.journalId,
    linkType: row.linkType,
    linkId: row.linkId,
  }));
}
