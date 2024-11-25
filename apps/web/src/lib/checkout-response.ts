import { z } from 'zod';
import { bookingQuoteSnapshotSchema, type BookingQuoteSnapshot } from '@hsm/contracts';
import { ClientFailure } from '@hsm/api-client';
// Bind a success to the agreed snapshot. The server may refresh only quotedAt.
export function requireCheckoutSnapshot(
  result: { branchId: string; quote: BookingQuoteSnapshot },
  branchId: string,
  expected: BookingQuoteSnapshot,
) {
  const branch = z.string().uuid().parse(branchId).toLowerCase();
  const actual = bookingQuoteSnapshotSchema.parse(result.quote),
    requested = bookingQuoteSnapshotSchema.parse(expected);
  if (
    result.branchId !== branch ||
    JSON.stringify({ ...actual, quotedAt: '' }) !== JSON.stringify({ ...requested, quotedAt: '' })
  )
    throw new ClientFailure('INVALID_RESPONSE');
}
