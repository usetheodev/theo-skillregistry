/**
 * Raised when an operation fails due to a business-rule violation (validation,
 * unique conflict) — the worker marks the operation FAILED and the job is NOT
 * retried (retrying a deterministic rule violation is a useless loop). Transient
 * errors (DB blip) are thrown plain so pg-boss retries with backoff.
 */
export class NonRetriableOperationError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'NonRetriableOperationError';
    this.reason = reason;
  }
}
