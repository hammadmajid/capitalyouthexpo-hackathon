import { z } from 'zod';
import {
  downloadResponseSchema,
  paymentInstructionListSchema,
  paymentReversalInputSchema,
  proofReviewInputSchema,
  residentProofInputSchema,
  residentProofPageQuerySchema,
  residentProofPageSchema,
  residentProofSchema,
  residentPaymentSummarySchema,
  staffProofPageQuerySchema,
  staffProofPageSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = (value: unknown) => stayIdentifierSchema.parse(value);
const header = (key: string) => ({ 'Idempotency-Key': id(key) });
export async function ownStayPaymentSummary(client: ApiClient, stay: unknown) {
  const stayId = id(stay);
  const result = await readApi(
    client.GET('/v1/me/stays/{stayId}/payment-summary', {
      params: { path: { stayId } },
    }),
    residentPaymentSummarySchema,
  );
  if (result.stayId !== stayId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
function pageQuery(input: unknown) {
  const query = residentProofPageQuerySchema.parse(input);
  return {
    query,
    params: {
      limit: query.limit,
      ...(query.state === undefined ? {} : { state: query.state }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    },
  };
}
// PAY-001: this Stay's own branch payment destinations.
export async function stayPaymentInstructions(client: ApiClient, stay: unknown) {
  return readApi(
    client.GET('/v1/me/stays/{stayId}/payment-instructions', {
      params: { path: { stayId: id(stay) } },
    }),
    paymentInstructionListSchema,
  );
}
// PAY-002/003: submission is pending verification and never a payment.
export async function submitStayPaymentProof(
  client: ApiClient,
  stay: unknown,
  input: unknown,
  key: string,
) {
  const stayId = id(stay),
    body = residentProofInputSchema.parse(input);
  const { reference, alsoInvoiceIds, invoiceId, depositPaisa, ...required } = body;
  const proof = await readApi(
    client.POST('/v1/me/stays/{stayId}/payment-proofs', {
      params: { path: { stayId }, header: header(key) },
      body: {
        ...required,
        ...(invoiceId === undefined ? {} : { invoiceId }),
        ...(depositPaisa === undefined ? {} : { depositPaisa }),
        ...(reference === undefined ? {} : { reference }),
        ...(alsoInvoiceIds?.length ? { alsoInvoiceIds } : {}),
      },
    }),
    residentProofSchema,
  );
  if (
    proof.stayId !== stayId ||
    proof.invoiceId !== (body.invoiceId ?? null) ||
    proof.state !== 'submitted' ||
    proof.amountPaisa !== body.amountPaisa ||
    (proof.depositPaisa ?? 0) !== (body.depositPaisa ?? 0)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return proof;
}
export async function ownStayPaymentProofs(client: ApiClient, stay: unknown, input: unknown = {}) {
  const stayId = id(stay),
    { query, params } = pageQuery(input);
  const page = await readApi(
    client.GET('/v1/me/stays/{stayId}/payment-proofs', {
      params: { path: { stayId }, query: params },
    }),
    residentProofPageSchema,
  );
  if (page.data.length > query.limit || page.data.some((row) => row.stayId !== stayId))
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
// PAY-004: staff verification queue for one branch.
export async function branchPaymentProofQueue(
  client: ApiClient,
  branch: unknown,
  input: unknown = {},
) {
  const branchId = id(branch),
    query = staffProofPageQuerySchema.parse(input),
    { params } = pageQuery({
      limit: query.limit,
      ...(query.state === undefined ? {} : { state: query.state }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/payment-proofs', {
      params: {
        path: { branchId },
        query: { ...params, ...(query.stayId === undefined ? {} : { stayId: query.stayId }) },
      },
    }),
    staffProofPageSchema,
  );
  if (
    page.data.length > query.limit ||
    page.data.some(
      (row) =>
        row.proof.branchId !== branchId ||
        (query.state !== undefined && row.proof.state !== query.state) ||
        (query.stayId !== undefined && row.proof.stayId !== query.stayId),
    )
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
// PAY-006..009: approval reports success only with the posted payment and its receipt.
export async function reviewStayPaymentProof(
  client: ApiClient,
  branch: unknown,
  proofId: unknown,
  review: unknown,
  key: string,
) {
  const branchId = id(branch),
    proof = id(proofId),
    body = proofReviewInputSchema.parse(review);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/payment-proofs/{proofId}/review', {
      params: { path: { branchId, proofId: proof }, header: header(key) },
      body,
    }),
    residentProofSchema,
  );
  if (
    result.id !== proof ||
    result.branchId !== branchId ||
    result.state !== (body.decision === 'approve' ? 'approved' : 'rejected')
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function stayPaymentProofLink(client: ApiClient, branch: unknown, proofId: unknown) {
  return readApi(
    client.GET('/v1/branches/{branchId}/payment-proofs/{proofId}/download', {
      params: { path: { branchId: id(branch), proofId: id(proofId) } },
    }),
    downloadResponseSchema,
  );
}
const reversalSchema = z
  .object({
    reversalId: stayIdentifierSchema,
    paymentId: stayIdentifierSchema,
    receiptId: stayIdentifierSchema,
  })
  .strict();
// Q14: Owner-only reversal; the server enforces ownership.
export async function reverseStayPayment(
  client: ApiClient,
  branch: unknown,
  stay: unknown,
  payment: unknown,
  input: unknown,
  key: string,
) {
  const paymentId = id(payment),
    body = paymentReversalInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/stays/{stayId}/payments/{paymentId}/reverse', {
      params: { path: { branchId: id(branch), stayId: id(stay), paymentId }, header: header(key) },
      body,
    }),
    reversalSchema,
  );
  if (result.paymentId !== paymentId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
// PAY-009: the authenticated PDF path (same-origin proxy adds credentials); never public.
export function ownReceiptPdfPath(stay: unknown, receipt: unknown) {
  return `/v1/me/stays/${id(stay)}/receipts/${id(receipt)}/pdf`;
}
export function staffReceiptPdfPath(branch: unknown, stay: unknown, receipt: unknown) {
  return `/v1/branches/${id(branch)}/stays/${id(stay)}/receipts/${id(receipt)}/pdf`;
}
