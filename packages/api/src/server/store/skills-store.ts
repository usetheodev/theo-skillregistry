import { type Skill } from '@usetheo/skillregistry/contract';
import { skills } from '@usetheo/skillregistry/db';
import { eq } from 'drizzle-orm';

import { type Db } from '../db.js';
import { isUniqueViolation, SkillAlreadyExistsError } from '../persistence/pg-errors.js';

export interface NewSkill {
  readonly skillId: string;
  readonly name: string;
  readonly description: string;
}

export interface SkillsStore {
  /** Insert a skill. Throws SkillAlreadyExistsError on a duplicate skillId. */
  create(input: NewSkill): Promise<void>;
  /** Fetch a skill by id, or undefined if absent. */
  getById(skillId: string): Promise<Skill | undefined>;
}

export function createSkillsStore(db: Db): SkillsStore {
  return {
    async create(input) {
      try {
        await db.insert(skills).values({
          skillId: input.skillId,
          name: input.name,
          description: input.description,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new SkillAlreadyExistsError(input.skillId);
        }
        throw err;
      }
    },

    async getById(skillId) {
      const rows = await db.select().from(skills).where(eq(skills.skillId, skillId)).limit(1);
      const row = rows[0];
      if (row === undefined) {
        return undefined;
      }
      return {
        skill_id: row.skillId,
        name: row.name,
        description: row.description,
        state: row.state,
      };
    },
  };
}
