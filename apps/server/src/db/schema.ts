import {
  pgTable,
  text,
  real,
  jsonb,
  timestamp,
  date,
  vector,
  index,
  unique,
  uuid,
  bigint,
  integer,
  numeric,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const rules = pgTable('rules', {
  id: text('id').primaryKey(),
  latestVersion: text('latest_version'),
  ownerUserId: text('owner_user_id'),
});

export const ruleVersions = pgTable(
  'rule_versions',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rules.id),
    version: text('version').notNull(),
    doc: jsonb('doc').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniq: unique().on(table.ruleId, table.version),
  })
);

export const userRules = pgTable('user_rules', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  baseRuleId: text('base_rule_id'),
});

export const userRuleVersions = pgTable('user_rule_versions', {
  id: text('id').primaryKey(),
  userRuleId: text('user_rule_id')
    .notNull()
    .references(() => userRules.id),
  version: text('version').notNull(),
  doc: jsonb('doc').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const signals = pgTable('signals', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(),
  ruleId: text('rule_id').notNull(),
  ruleVersion: text('rule_version').notNull(),
  confidence: real('confidence').notNull(),
  ctx: jsonb('ctx').notNull(),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
});

export const signalExplanations = pgTable('signal_explanations', {
  id: text('id').primaryKey(),
  signalId: text('signal_id')
    .notNull()
    .references(() => signals.id),
  text: text('text').notNull(),
  tokens: text('tokens').notNull(),
  model: text('model').notNull(),
});

export const journals = pgTable('journals', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  date: date('date').notNull(),
  markdown: text('markdown').notNull(),
});

export const journalLinks = pgTable('journal_links', {
  id: text('id').primaryKey(),
  journalId: text('journal_id')
    .notNull()
    .references(() => journals.id),
  linkType: text('link_type').notNull(),
  linkId: text('link_id').notNull(),
});

export const coachProfiles = pgTable('coach_profiles', {
  userId: text('user_id').primaryKey(),
  agentName: text('agent_name').notNull(),
  voiceId: text('voice_id').notNull(),
  jargonLevel: real('jargon_level').notNull(),
  decisiveness: real('decisiveness').notNull(),
  tone: text('tone').notNull(),
});

export const coachMemories = pgTable(
  'coach_memories',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    text: text('text').notNull(),
    tags: text('tags').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
  },
  (table) => ({
    embeddingIdx: index('embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  })
);

export const auditLedger = pgTable('audit_ledger', {
  id: text('id').primaryKey(),
  prevHash: text('prev_hash'),
  hash: text('hash').notNull(),
  payload: jsonb('payload').notNull(),
  ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
});

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  ruleId: text('rule_id').notNull(),
  label: text('label').notNull(), // 'good' | 'bad' | 'missed' | 'late'
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ruleMetricsDaily = pgTable(
  'rule_metrics_daily',
  {
    userId: text('user_id').notNull(),
    ruleId: text('rule_id').notNull(),
    day: date('day').notNull(),
    fired: integer('fired').notNull().default(0),
    actionable: integer('actionable').notNull().default(0),
    good: integer('good').notNull().default(0),
    bad: integer('bad').notNull().default(0),
    expectancy: numeric('expectancy', { precision: 10, scale: 4 }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.ruleId, table.day] }),
  })
);
