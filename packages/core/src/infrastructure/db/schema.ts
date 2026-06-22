import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Skills — the registered capability. M0 stores the minimal record; the full
 * SKILL.md payload + revisions land in M1.
 */
export const skills = pgTable('skills', {
  skillId: text('skill_id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  state: text('state').notNull().default('ACTIVE'),
  createTime: timestamp('create_time', { withTimezone: true }).notNull().defaultNow(),
  updateTime: timestamp('update_time', { withTimezone: true }).notNull().defaultNow(),
});

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
export type OperationRow = typeof operations.$inferSelect;
