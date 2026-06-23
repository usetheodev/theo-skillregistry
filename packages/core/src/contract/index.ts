import { z } from 'zod';

import { parseSkillId } from '../domain/skill-id.js';

/**
 * Operation lifecycle states (M2). In-progress states reflect the job type
 * (CREATING/UPDATING/DELETING); terminal states are ACTIVE (succeeded) / FAILED.
 */
export const OperationStateSchema = z.enum([
  'CREATING',
  'UPDATING',
  'DELETING',
  'ACTIVE',
  'FAILED',
]);
export type OperationState = z.infer<typeof OperationStateSchema>;

/** Webhook event types emitted on operation completion. */
export const WebhookEventTypeSchema = z.enum([
  'skill.created',
  'skill.updated',
  'skill.deleted',
]);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

/** Webhook payload delivered to subscribed endpoints. */
export const WebhookPayloadSchema = z.object({
  event_id: z.string(),
  event_type: WebhookEventTypeSchema,
  data: z.object({
    skill_id: z.string(),
    operation_id: z.string(),
    state: z.enum(['ACTIVE', 'FAILED']),
    occurred_at: z.string(),
  }),
});
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

/** Input payload for POST /v1/skills. Minimal in M0 (Theokit-aligned fields). */
export const SkillInputSchema = z
  .object({
    skill_id: z.string(),
    name: z.string().min(1, 'name is required').max(255),
    description: z.string().max(4096).default(''),
  })
  .superRefine((val, ctx) => {
    try {
      parseSkillId(val.skill_id);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['skill_id'],
        message: err instanceof Error ? err.message : 'invalid skill_id',
      });
    }
  });
export type SkillInput = z.infer<typeof SkillInputSchema>;

/** Public skill representation (GET /v1/skills/{id}). */
export const SkillSchema = z.object({
  skill_id: z.string(),
  name: z.string(),
  description: z.string(),
  state: z.string(),
});
export type Skill = z.infer<typeof SkillSchema>;

/** Public operation representation (GET /v1/operations/{id}). */
export const OperationSchema = z.object({
  operation_id: z.string(),
  skill_id: z.string(),
  type: z.string(),
  state: OperationStateSchema,
  error: z.string().nullable(),
});
export type Operation = z.infer<typeof OperationSchema>;
