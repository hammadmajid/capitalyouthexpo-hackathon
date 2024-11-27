import { z } from 'zod';
import { createDatabase, recoverResidentBilling } from '@hsm/db';
import type { Logger } from 'pino';
const argsSchema = z.tuple([
  z.literal('recover-billing'),
  z.string().uuid(),
  z.string().uuid(),
  z.coerce.number().int().min(5).max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^[A-Z][A-Z0-9-]{2,63}$/),
  z.literal('--apply'),
]);
export function parseBillingRecoveryArgs(args: string[]) {
  const [, branchId, jobId, expectedAttempts, incident] = argsSchema.parse(args);
  return { branchId, jobId, expectedAttempts, incident };
}
// Explicit local maintenance only: the operator already holds trusted Worker DB credentials.
export async function billingRecoveryCli(args: string[], env: NodeJS.ProcessEnv, logger: Logger) {
  const input = parseBillingRecoveryArgs(args);
  if (env.CNIC_ENCRYPTION_KEY || env.CNIC_HASH_KEY)
    throw new Error('Recovery configuration unavailable');
  const url = z
    .string()
    .url()
    .regex(/^postgres(?:ql)?:/)
    .parse(env.DATABASE_URL);
  const connection = createDatabase(url);
  try {
    await recoverResidentBilling(connection.db, input);
    logger.info({ code: 'BILLING_RECOVERY_REQUESTED' }, 'Billing recovery queued');
  } finally {
    await connection.close();
  }
}
