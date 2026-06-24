/** Wall-clock seam — injectable so webhook signing/timestamps are deterministic in tests.
 * Single source for the `now(): Date` clock shared by the webhook workers (DRY). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
