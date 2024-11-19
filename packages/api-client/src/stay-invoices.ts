import {
  invoiceReissueInputSchema,
  invoiceReissueResultSchema,
  residentInvoiceBalanceSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function readStaffStayInvoice(
  client: ApiClient,
  inputBranch: string,
  inputStay: string,
  inputInvoice: string,
) {
  const branchId = stayIdentifierSchema.parse(inputBranch),
    stayId = stayIdentifierSchema.parse(inputStay),
    invoiceId = stayIdentifierSchema.parse(inputInvoice);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/stays/{stayId}/invoices/{invoiceId}', {
      params: { path: { branchId, stayId, invoiceId } },
    }),
    residentInvoiceBalanceSchema,
  );
  if (result.invoiceId !== invoiceId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readCustomerStayInvoice(
  client: ApiClient,
  inputStay: string,
  inputInvoice: string,
) {
  const stayId = stayIdentifierSchema.parse(inputStay),
    invoiceId = stayIdentifierSchema.parse(inputInvoice);
  const result = await readApi(
    client.GET('/v1/me/stays/{stayId}/invoices/{invoiceId}', {
      params: { path: { stayId, invoiceId } },
    }),
    residentInvoiceBalanceSchema,
  );
  if (result.invoiceId !== invoiceId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
// CHG-053: Owner-only cancel of a wholly unpaid bill, reissued with a corrected due date.
export async function reissueStayInvoice(
  client: ApiClient,
  inputBranch: string,
  inputStay: string,
  inputInvoice: string,
  input: unknown,
  key: string,
) {
  const branchId = stayIdentifierSchema.parse(inputBranch),
    stayId = stayIdentifierSchema.parse(inputStay),
    invoiceId = stayIdentifierSchema.parse(inputInvoice),
    body = invoiceReissueInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/stays/{stayId}/invoices/{invoiceId}/reissue', {
      params: {
        path: { branchId, stayId, invoiceId },
        header: { 'Idempotency-Key': stayIdentifierSchema.parse(key) },
      },
      body,
    }),
    invoiceReissueResultSchema,
  );
  if (result.voidedInvoiceId !== invoiceId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
