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
  boolean,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const magicLinks = pgTable('magic_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

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
  trades: jsonb('trades'), // Array of Trade objects
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
  agentName: text('agent_name').notNull().default('Nexa'),
  pronouns: text('pronouns').notNull().default('she/her'),
  voiceId: text('voice_id').notNull().default('alloy'), // Professional, consistent voice
  personality: text('personality').notNull().default('warm and intelligent'),
  jargonLevel: real('jargon_level').notNull().default(0.5),
  decisiveness: real('decisiveness').notNull().default(0.7),
  tone: text('tone').notNull().default('supportive'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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

export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id').primaryKey(),
  favoriteSymbols: text('favorite_symbols').array().notNull().default(['SPY', 'QQQ', 'NVDA']),
  defaultTimeframe: text('default_timeframe').notNull().default('1m'),
  chartTheme: text('chart_theme').notNull().default('dark'),
  focusMode: text('focus_mode').notNull().default('normal'),
  signalDensity: text('signal_density').notNull().default('medium'),
  signalAudio: boolean('signal_audio').notNull().default(true),
  colorVision: text('color_vision').notNull().default('normal'),
  highContrast: boolean('high_contrast').notNull().default(false),
  notifications: jsonb('notifications').notNull().default({
    voice: true,
    visual: true,
    sound: true,
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const knowledgeUploads = pgTable('knowledge_uploads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  sourceType: text('source_type').notNull(), // 'youtube' | 'pdf' | 'text' | 'url'
  sourceUrl: text('source_url'),
  title: text('title').notNull(),
  status: text('status').notNull().default('processing'), // 'processing' | 'completed' | 'failed'
  chunksCount: integer('chunks_count').notNull().default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

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

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const patternStats = pgTable(
  'pattern_stats',
  {
    id: text('id').primaryKey(),
    symbol: text('symbol').notNull(),
    timeframe: text('timeframe').notNull(),
    setup: text('setup').notNull(),
    regime: text('regime').notNull(),
    winRate: real('win_rate').notNull(),
    evR: real('ev_r').notNull(),
    maeP50: real('mae_p50').notNull(),
    maeP80: real('mae_p80').notNull(),
    mfeP50: real('mfe_p50').notNull(),
    mfeP80: real('mfe_p80').notNull(),
    timeToTarget: real('time_to_target').notNull(),
    falseBreakRate: real('false_break_rate').notNull(),
    volumeZScores: jsonb('volume_zscores').notNull(),
    rangeZScores: jsonb('range_zscores').notNull(),
    vwapBehaviors: text('vwap_behaviors').array().notNull(),
    atrPercentile: real('atr_percentile').notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    symbolTimeframeSetupIdx: index('pattern_stats_symbol_timeframe_setup_idx').on(
      table.symbol,
      table.timeframe,
      table.setup
    ),
  })
);

export const callouts = pgTable(
  'callouts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    symbol: text('symbol').notNull(),
    timeframe: text('timeframe').notNull(),
    kind: text('kind').notNull(),
    setupTag: text('setup_tag').notNull(),
    rationale: text('rationale').array().notNull(),
    qualityGrade: text('quality_grade').notNull(),
    urgency: text('urgency').notNull(),
    rulesPass: boolean('rules_pass').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    accepted: boolean('accepted'),
    rejectedReason: text('rejected_reason'),
  },
  (table) => ({
    symbolTimestampIdx: index('callouts_symbol_timestamp_idx').on(table.symbol, table.timestamp),
  })
);

export const journalEvents = pgTable('journal_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(),
  indicators: jsonb('indicators'),
  proposal: jsonb('proposal'),
  decision: text('decision'),
  mae: real('mae'),
  mfe: real('mfe'),
  realizedR: real('realized_r'),
  rulesRef: text('rules_ref'),
  qualityGrade: text('quality_grade'),
  reasoning: text('reasoning').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});
