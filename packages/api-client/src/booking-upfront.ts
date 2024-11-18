import { z } from 'zod';
import {
  bookingActionInputSchema,
  bookingProofInputSchema,
  bookingProofReviewSchema,
  bookingSummarySchema,
  downloadResponseSchema,
  paymentInstructionInputSchema,
  paymentInstructionListSchema,
  paymentInstructionSchema,
  upfrontSettingsSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
type BookingSummary = z.infer<typeof bookingSummarySchema>;
const identifier = (value: string) => z.string().uuid().parse(value).toLowerCase();
function command(key: string) {
  return { 'Idempotency-Key': identifier(key) };
}
function same(response: BookingSummary, bookingId: string, branchId?: string) {
  if (response.id !== bookingId || (branchId !== undefined && response.branchId !== branchId))
    throw new ClientFailure('INVALID_RESPONSE');
  return response;
}
// SRS v2.11: staff approval opens payment; it never reports confirmation.
export async function approveUpfrontBooking(
  client: ApiClient,
  branchId: string,
  bookingId: string,
  reason: string,
  key: string,
) {
  const branch = identifier(branchId),
    booking = identifier(bookingId);
  const response = same(
    await readApi(
      client.POST('/v1/branches/{branchId}/bookings/{bookingId}/approve', {
        params: { path: { branchId: branch, bookingId: booking }, header: command(key) },
        body: bookingActionInputSchema.parse({ reason }),
      }),
      bookingSummarySchema,
    ),
    booking,
    branch,
  );
  if (response.state !== 'pending_request' || response.upfront?.status !== 'awaiting_payment')
    throw new ClientFailure('INVALID_RESPONSE');
  return response;
}
export async function submitBookingPaymentProof(
  client: ApiClient,
  bookingId: string,
  input: unknown,
  key: string,
) {
  const booking = identifier(bookingId),
    body = bookingProofInputSchema.parse(input);
  const response = same(
    await readApi(
      client.POST('/v1/me/bookings/{bookingId}/payment-proofs', {
        params: { path: { bookingId: booking }, header: command(key) },
        body,
      }),
      bookingSummarySchema,
    ),
    booking,
  );
  const proof = response.upfront?.proof;
  if (
    response.upfront?.status !== 'verification_pending' ||
    proof?.state !== 'submitted' ||
    proof.amountPaisa !== body.amountPaisa
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return response;
}
// ACC-004: approval reports success only with a verified proof and a confirmed booking.
export async function reviewBookingPaymentProof(
  client: ApiClient,
  branchId: string,
  bookingId: string,
  proofId: string,
  review: unknown,
  key: string,
) {
  const branch = identifier(branchId),
    booking = identifier(bookingId),
    proof = identifier(proofId),
    body = bookingProofReviewSchema.parse(review);
  const response = same(
    await readApi(
      client.POST('/v1/branches/{branchId}/bookings/{bookingId}/payment-proofs/{proofId}/review', {
        params: {
          path: { branchId: branch, bookingId: booking, proofId: proof },
          header: command(key),
        },
        body,
      }),
      bookingSummarySchema,
    ),
    booking,
    branch,
  );
  const result = response.upfront?.proof;
  const valid =
    body.decision === 'approve'
      ? response.state === 'confirmed' &&
        response.upfront?.status === 'verified' &&
        result?.id === proof &&
        result.state === 'approved'
      : response.upfront?.status === 'awaiting_payment' &&
        result?.id === proof &&
        result.state === 'rejected';
  if (!valid) throw new ClientFailure('INVALID_RESPONSE');
  return response;
}
export function bookingPaymentProofLink(
  client: ApiClient,
  branchId: string,
  bookingId: string,
  proofId: string,
) {
  return readApi(
    client.GET('/v1/branches/{branchId}/bookings/{bookingId}/payment-proofs/{proofId}/download', {
      params: {
        path: {
          branchId: identifier(branchId),
          bookingId: identifier(bookingId),
          proofId: identifier(proofId),
        },
      },
    }),
    downloadResponseSchema,
  );
}
export async function customerPaymentInstructions(client: ApiClient, bookingId: string) {
  return readApi(
    client.GET('/v1/me/bookings/{bookingId}/payment-instructions', {
      params: { path: { bookingId: identifier(bookingId) } },
    }),
    paymentInstructionListSchema,
  );
}
export async function branchPaymentInstructions(client: ApiClient, branchId: string) {
  const branch = identifier(branchId);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/payment-instructions', {
      params: { path: { branchId: branch } },
    }),
    paymentInstructionListSchema,
  );
  if (result.branchId !== branch || result.data.some((row) => row.branchId !== branch))
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function addPaymentInstruction(
  client: ApiClient,
  branchId: string,
  input: unknown,
  key: string,
) {
  const branch = identifier(branchId),
    body = paymentInstructionInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/payment-instructions', {
      params: { path: { branchId: branch }, header: command(key) },
      body,
    }),
    paymentInstructionSchema,
  );
  if (
    result.branchId !== branch ||
    result.method !== body.method ||
    result.accountIdentifier !== body.accountIdentifier
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function archivePaymentInstruction(
  client: ApiClient,
  branchId: string,
  instructionId: string,
  key: string,
) {
  const branch = identifier(branchId),
    id = identifier(instructionId);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/payment-instructions/{instructionId}/archive', {
      params: { path: { branchId: branch, instructionId: id }, header: command(key) },
    }),
    paymentInstructionSchema,
  );
  if (result.id !== id || result.branchId !== branch) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export function readUpfrontSettings(client: ApiClient, branchId: string) {
  return readApi(
    client.GET('/v1/branches/{branchId}/upfront-settings', {
      params: { path: { branchId: identifier(branchId) } },
    }),
    upfrontSettingsSchema,
  );
}
export async function updateUpfrontSettings(
  client: ApiClient,
  branchId: string,
  input: unknown,
  key: string,
) {
  const body = upfrontSettingsSchema.parse(input);
  const result = await readApi(
    client.PUT('/v1/branches/{branchId}/upfront-settings', {
      params: { path: { branchId: identifier(branchId) }, header: command(key) },
      body,
    }),
    upfrontSettingsSchema,
  );
  if (
    result.requirement !== body.requirement ||
    result.proofRetryAllowed !== body.proofRetryAllowed
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
