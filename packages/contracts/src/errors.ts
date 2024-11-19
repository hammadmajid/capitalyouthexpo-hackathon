import { z } from 'zod';
export const errorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'TOKEN_EXPIRED',
  'SESSION_REVOKED',
  'FORBIDDEN',
  'BRANCH_FORBIDDEN',
  'ACCOUNT_SUSPENDED',
  'EMAIL_NOT_VERIFIED',
  'NOT_FOUND',
  'CONFLICT',
  'IMPORT_ALREADY_COMMITTED',
  'PRECONDITION_FAILED',
  'IDENTITY_EXISTS',
  'IDENTITY_EXISTS_CLAIM_REQUIRED',
  'UNDERAGE',
  'RATE_LIMITED',
  'IDEMPOTENCY_KEY_REUSED',
  'ROOT_ADMIN_LIMIT',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    // Optional safe input path (for example 'phone') echoed in problem.errors.
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
export const problemSchema = z
  .object({
    type: z.string().url(),
    title: z.string(),
    status: z.number().int(),
    code: errorCodeSchema,
    detail: z.string(),
    traceId: z.string(),
    errors: z
      .array(z.object({ path: z.string(), code: z.string(), message: z.string() }).strict())
      .optional(),
  })
  .strict();
