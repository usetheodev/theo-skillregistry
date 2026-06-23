import { desc } from 'drizzle-orm';
import { customType, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Postgres `bytea` column type (Drizzle has no native helper). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
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
    createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('skill_revisions_skill_id_create_time_idx').on(t.skillId, desc(t.createTime))],
);

/**
 * Operations — first-class long-running operation (ADR-1). pg-boss carries the
 * job; the authoritative operation state lives here.
 */
export const operations = pgTable('operations', {
  operationId: text('operation_id').primaryKey(),
  // NO foreign key to skills.skill_id BY DESIGN: the operation row is created
  // (CREATING) before the skill exists — the worker inserts the skill only on
  // success. An FK here would make the operation insert fail. Do not "fix" this.
  skillId: text('skill_id').notNull(),
  type: text('type').notNull(),
  state: text('state').notNull(),
  error: text('error'),
  createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
  updateTime: timestamp('update_time', { withTimezone: true }).notNull().defaultNow(),
});

export type SkillRow = typeof skills.$inferSelect;
export type SkillRevisionRow = typeof skillRevisions.$inferSelect;
export type OperationRow = typeof operations.$inferSelect;
