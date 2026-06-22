import { describe } from 'vitest';

export const PG_URI = process.env['THEOSKILL_PG_URI'] ?? '';

const hasDb = PG_URI !== '';

/** Integration suites skip automatically when THEOSKILL_PG_URI is unset. */
export const describeIntegration = describe.skipIf(!hasDb);
