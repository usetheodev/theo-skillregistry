import { desc, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Postgres `bytea` column type (Drizzle has no native helper). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/** Embedding dimension pinned at 1536 (matches the EmbeddingProvider contract). */
export const EMBEDDING_COLUMN_DIM = 1536;

/**
 * Postgres `vector(1536)` column type (pgvector). Encodes `number[]` to the
 * `[a,b,c]` literal on the way in and parses it back on the way out. Dimension
 * is pinned (M3 ADR D2) — changing it requires a migration + ADR.
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBEDDING_COLUMN_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(raw: string): number[] {
    return JSON.parse(raw) as number[];
  },
});

/**
 * Skills — the registered capability. M1 adds the pointer to the current
 * revision and the soft-delete + id-reservation columns (ADR-3/ADR-5).
 */
export const skills = pgTable('skills', {
  skillId: text('skill_id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  state: text('state').notNull().default('ACTIVE'),
  latestRevisionId: text('latest_revision_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  reservedUntil: timestamp('reserved_until', { withTimezone: true }),
  createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
  updateTime: timestamp('update_time', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Skill revisions — immutable snapshots (ADR-3). Never UPDATEd. The zip payload
 * is stored as bytea; `content_hash` is the sha256 of the zip (integrity + dedup);
 * `frontmatter` is the parsed SKILL.md frontmatter (jsonb, unknown fields kept).
 */
export const skillRevisions = pgTable(
  'skill_revisions',
  {
    revisionId: text('revision_id').primaryKey(),
    skillId: text('skill_id').notNull(),
    payload: bytea('payload').notNull(),
    contentHash: text('content_hash').notNull(),
    frontmatter: jsonb('frontmatter').notNull(),
    // M3: the SKILL.md markdown text captured at ingest — the embed worker reads
    // it (with name + description) as the embedding source, avoiding a re-unzip.
    skillMd: text('skill_md').notNull().default(''),
    createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('skill_revisions_skill_id_create_time_idx').on(t.skillId, desc(t.createTime))],
);

/**
 * Embeddings — one dense vector per (revision, provider, model). M3. Generated
 * asynchronously by the `embed_skill` worker; idempotent via the unique index +
 * `ON CONFLICT DO NOTHING`. HNSW cosine index powers intent search (M4).
 */
export const embeddings = pgTable(
  'embeddings',
  {
    id: text('id').primaryKey(),
    revisionId: text('revision_id')
      .notNull()
      .references(() => skillRevisions.revisionId, { onDelete: 'cascade' }),
    skillId: text('skill_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    dimensions: integer('dimensions').notNull(),
    vector: vector('vector').notNull(),
    createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('embeddings_revision_provider_model_uq').on(t.revisionId, t.provider, t.model),
    index('embeddings_vector_hnsw').using('hnsw', t.vector.op('vector_cosine_ops')),
  ],
);

/**
 * Operations — first-class long-running operation (ADR-1). pg-boss carries the
 * job; the authoritative operation state lives here.
 */
export const operations = pgTable(
  'operations',
  {
    operationId: text('operation_id').primaryKey(),
    // NO foreign key to skills.skill_id BY DESIGN: the operation row is created
    // (CREATING) before the skill exists — the worker inserts the skill only on
    // success. An FK here would make the operation insert fail. Do not "fix" this.
    skillId: text('skill_id').notNull(),
    type: text('type').notNull(),
    state: text('state').notNull(),
    error: text('error'),
    // M2: optional client idempotency key — a resend with the same key returns
    // the same operation (partial-unique: many NULLs allowed).
    idempotencyKey: text('idempotency_key'),
    createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
    updateTime: timestamp('update_time', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('operations_idempotency_key_uq')
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);

/** Webhook endpoints — subscriptions that receive skill events (M2). */
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  // Server-generated HMAC secret, returned once on create.
  secret: text('secret').notNull(),
  active: boolean('active').notNull().default(true),
  // Optional event-type filter (jsonb array); null/empty = all events.
  eventTypes: jsonb('event_types'),
  createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
  updateTime: timestamp('update_time', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Webhook deliveries — the durable outbox row (M2, ADR-3). The reconciler
 * recovers rows whose original enqueue never landed (orphan = all of
 * delivered_at/failed_at/enqueued_at NULL).
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }),
    createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('webhook_deliveries_orphan_scan')
      .on(t.createTime)
      .where(sql`${t.deliveredAt} IS NULL AND ${t.failedAt} IS NULL AND ${t.enqueuedAt} IS NULL`),
  ],
);

export type SkillRow = typeof skills.$inferSelect;
export type SkillRevisionRow = typeof skillRevisions.$inferSelect;
export type OperationRow = typeof operations.$inferSelect;
export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type EmbeddingRow = typeof embeddings.$inferSelect;
