import {
  bookingAdmissionCommandSchema,
  bookingAdmissionPreviewSchema,
  bookingAdmissionResultSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// STAY-001 / BKG-004: the exact agreement terms a check-in would use.
export async function previewBookingCheckIn(
  client: ApiClient,
  branch: unknown,
  booking: unknown,
  policyVersion?: unknown,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    bookingId = stayIdentifierSchema.parse(booking),
    policyVersionId =
      policyVersion === undefined ? undefined : stayIdentifierSchema.parse(policyVersion);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/stays/bookings/{bookingId}/terms', {
      params: { path: { branchId, bookingId }, query: policyVersionId ? { policyVersionId } : {} },
    }),
    bookingAdmissionPreviewSchema,
  );
  if (
    result.branchId !== branchId ||
    result.bookingId !== bookingId ||
    (policyVersionId !== undefined && result.terms.policyVersionId !== policyVersionId)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
// ACC-001: callers retain one key for retries of one unchanged check-in intent.
export async function checkInBooking(
  client: ApiClient,
  branch: unknown,
  booking: unknown,
  body: unknown,
  key: string,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    bookingId = stayIdentifierSchema.parse(booking),
    input = bookingAdmissionCommandSchema.parse(body);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/stays/bookings/{bookingId}/check-in', {
      params: {
        path: { branchId, bookingId },
        header: { 'Idempotency-Key': stayIdentifierSchema.parse(key) },
      },
      body: {
        policyVersionId: input.policyVersionId,
        ...(input.cnic === undefined ? {} : { cnic: input.cnic }),
        initialBilling: input.initialBilling.map(({ manualAmountPaisa, ...line }) =>
          manualAmountPaisa === undefined ? line : { ...line, manualAmountPaisa },
        ),
      },
    }),
    bookingAdmissionResultSchema,
  );
  if (result.branchId !== branchId || result.bookingId !== bookingId)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
