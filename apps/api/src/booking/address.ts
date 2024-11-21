import { eq } from 'drizzle-orm';
import { users } from '@hsm/db';
import { DomainError, permanentAddressSchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
// AUTH-C-005 / SEC-003: private identity stays outside booking snapshots and responses.
// Caller supplies the authenticated Customer ID (or persisted booking Customer ID).
export async function requireBookingAddress(
  transaction: Transaction,
  customerId: string,
  supplied?: string,
) {
  const [identity] = await transaction
    .select({ permanentAddress: users.permanentAddress })
    .from(users)
    .where(eq(users.id, customerId))
    .for('update');
  if (!identity) throw new DomainError('NOT_FOUND', 404, 'Customer identity unavailable');
  const address = permanentAddressSchema.safeParse(supplied ?? identity.permanentAddress);
  if (!address.success)
    throw new DomainError('VALIDATION_FAILED', 422, 'Provide a permanent address before booking');
  if (supplied !== undefined)
    await transaction
      .update(users)
      .set({ permanentAddress: address.data })
      .where(eq(users.id, customerId));
}
