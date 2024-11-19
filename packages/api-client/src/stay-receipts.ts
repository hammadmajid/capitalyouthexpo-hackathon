import { stayIdentifierSchema, residentReceiptDetailSchema } from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function readStaffStayReceipt(
  client: ApiClient,
  inputBranch: string,
  inputStay: string,
  inputReceipt: string,
) {
  const branchId = stayIdentifierSchema.parse(inputBranch),
    stayId = stayIdentifierSchema.parse(inputStay),
    receiptId = stayIdentifierSchema.parse(inputReceipt);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/stays/{stayId}/receipts/{receiptId}', {
      params: { path: { branchId, stayId, receiptId } },
    }),
    residentReceiptDetailSchema,
  );
  if (
    result.receiptId !== receiptId ||
    result.snapshot.stayId !== stayId ||
    result.snapshot.branchId !== branchId
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readCustomerStayReceipt(
  client: ApiClient,
  inputStay: string,
  inputReceipt: string,
) {
  const stayId = stayIdentifierSchema.parse(inputStay),
    receiptId = stayIdentifierSchema.parse(inputReceipt);
  const result = await readApi(
    client.GET('/v1/me/stays/{stayId}/receipts/{receiptId}', {
      params: { path: { stayId, receiptId } },
    }),
    residentReceiptDetailSchema,
  );
  if (result.receiptId !== receiptId || result.snapshot.stayId !== stayId)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
