import { type Operation, type OperationState } from '@usetheo/skillregistry/contract';
import { operations } from '@usetheo/skillregistry/db';
import { eq } from 'drizzle-orm';

import { type Db } from '../db.js';

export interface NewOperation {
  readonly operationId: string;
  readonly skillId: string;
  readonly type: string;
}

export interface OperationsStore {
  /** Insert an operation in the CREATING state. */
  create(input: NewOperation): Promise<void>;
  /** Fetch an operation by id, or undefined if absent. */
  get(operationId: string): Promise<Operation | undefined>;
  /** Transition an operation to a terminal state (done/failed), optionally with an error. */
  updateState(operationId: string, state: OperationState, error?: string): Promise<void>;
}

export function createOperationsStore(db: Db): OperationsStore {
  return {
    async create(input) {
      await db.insert(operations).values({
        operationId: input.operationId,
        skillId: input.skillId,
        type: input.type,
        state: 'CREATING',
        error: null,
      });
    },

    async get(operationId) {
      const rows = await db
        .select()
        .from(operations)
        .where(eq(operations.operationId, operationId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) {
        return undefined;
      }
      return {
        operation_id: row.operationId,
        skill_id: row.skillId,
        type: row.type,
        state: row.state as OperationState,
        error: row.error,
      };
    },

    async updateState(operationId, state, error) {
      await db
        .update(operations)
        .set({ state, error: error ?? null, updateTime: new Date() })
        .where(eq(operations.operationId, operationId));
    },
  };
}
