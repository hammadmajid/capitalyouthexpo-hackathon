import {
  stayIdentifierSchema,
  newResidentPaymentInputSchema,
  recordedResidentPaymentSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// PAY-008 / FIN-001 / ACC-004: the caller owns the reviewed command/key.
// The result acknowledges a recorded external payment; it does not assert a
// particular invoice is fully paid or move money through the platform.
export async function recordStayExternalPayment(
  client: ApiClient,
  inputBranch: unknown,
  inputStay: unknown,
  body: unknown,
  key: unknown,
) {
  const branchId = stayIdentifierSchema.parse(inputBranch),
    stayId = stayIdentifierSchema.parse(inputStay),
    commandId = stayIdentifierSchema.parse(key),
    payment = newResidentPaymentInputSchema.parse(body),
    { transactionReference, proofFileId, ...required } = payment;
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/stays/{stayId}/payments', {
      params: { path: { branchId, stayId }, header: { 'Idempotency-Key': commandId } },
      body: {
        ...required,
        ...(transactionReference === undefined ? {} : { transactionReference }),
        ...(proofFileId === undefined ? {} : { proofFileId }),
      },
    }),
    recordedResidentPaymentSchema,
  );
  if (result.amountPaisa !== payment.amountPaisa) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
