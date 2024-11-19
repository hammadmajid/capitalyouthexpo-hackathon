import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  branchPaymentProofQueue,
  ownReceiptPdfPath,
  ownStayPaymentProofs,
  reverseStayPayment,
  reviewStayPaymentProof,
  staffReceiptPdfPath,
  stayPaymentInstructions,
  stayPaymentProofLink,
  submitStayPaymentProof,
} from './resident-proofs.js';
const ids = {
  branch: '10000000-0000-4000-8000-000000000001',
  stay: '10000000-0000-4000-8000-000000000002',
  invoice: '10000000-0000-4000-8000-000000000003',
  file: '10000000-0000-4000-8000-000000000004',
  proof: '10000000-0000-4000-8000-000000000005',
  key: '10000000-0000-4000-8000-000000000006',
};
const proof = {
  id: ids.proof,
  branchId: ids.branch,
  stayId: ids.stay,
  invoiceId: ids.invoice,
  invoiceNumber: 'INV-1',
  amountPaisa: 1000,
  method: 'bank_transfer',
  paidOn: '2026-10-24',
  reference: null,
  state: 'submitted',
  reviewReason: null,
  paymentId: null,
  receiptId: null,
  submittedAt: '2026-10-25T10:00:00.000Z',
  reviewedAt: null,
};
function fixture(data: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'private-access' },
      fetch,
    }),
  };
}
const url = (value: ReturnType<typeof fixture>) => (value.fetch.mock.calls[0]?.[0] as Request).url;
const input = {
  invoiceId: ids.invoice,
  fileId: ids.file,
  amountPaisa: 1000,
  method: 'bank_transfer',
  paidOn: '2026-10-24',
};
it('PAY-001..003: resident routes bind the Stay, idempotency key and pending state', async () => {
  const instructions = fixture({ branchId: ids.branch, data: [] });
  await stayPaymentInstructions(instructions.client, ids.stay);
  expect(url(instructions)).toBe(
    `https://api.example.test/v1/me/stays/${ids.stay}/payment-instructions`,
  );
  const submit = fixture(proof, 201);
  await expect(submitStayPaymentProof(submit.client, ids.stay, input, ids.key)).resolves.toEqual(
    proof,
  );
  const request = submit.fetch.mock.calls[0]?.[0] as Request;
  expect(request.headers.get('Idempotency-Key')).toBe(ids.key);
  const withReference = fixture({ ...proof, reference: 'R' }, 201);
  await submitStayPaymentProof(
    withReference.client,
    ids.stay,
    { ...input, reference: 'R' },
    ids.key,
  );
  await expect(
    submitStayPaymentProof(
      fixture({ ...proof, amountPaisa: 5 }, 201).client,
      ids.stay,
      input,
      ids.key,
    ),
  ).rejects.toThrow();
  const own = fixture({ data: [proof], nextCursor: null });
  await ownStayPaymentProofs(own.client, ids.stay, { state: 'submitted', cursor: ids.proof });
  expect(url(own)).toContain('limit=20&state=submitted&cursor=' + ids.proof);
  await expect(
    ownStayPaymentProofs(
      fixture({ data: [{ ...proof, stayId: ids.branch }], nextCursor: null }).client,
      ids.stay,
    ),
  ).rejects.toThrow();
});
it('PAY-004..009 / Q14: staff routes validate scope and outcome', async () => {
  const row = {
    proof,
    residentName: 'R',
    roomLabel: null,
    bedLabel: null,
    invoiceOutstandingPaisa: 1000,
    amountMismatch: false,
  };
  await expect(
    branchPaymentProofQueue(fixture({ data: [row], nextCursor: null }).client, ids.branch, {
      state: 'submitted',
    }),
  ).resolves.toMatchObject({ data: [row] });
  await expect(
    branchPaymentProofQueue(fixture({ data: [row], nextCursor: null }).client, ids.branch, {
      state: 'approved',
    }),
  ).rejects.toThrow();
  const rejected = {
    ...proof,
    state: 'rejected',
    reviewReason: 'x',
    reviewedAt: proof.submittedAt,
  };
  await expect(
    reviewStayPaymentProof(
      fixture(rejected).client,
      ids.branch,
      ids.proof,
      { decision: 'reject', reason: 'x' },
      ids.key,
    ),
  ).resolves.toMatchObject({ state: 'rejected' });
  await expect(
    reviewStayPaymentProof(
      fixture(rejected).client,
      ids.branch,
      ids.proof,
      { decision: 'approve' },
      ids.key,
    ),
  ).rejects.toThrow();
  const link = fixture({ url: 'https://files.example.test/x', expiresAt: proof.submittedAt });
  await stayPaymentProofLink(link.client, ids.branch, ids.proof);
  expect(url(link)).toContain(`/payment-proofs/${ids.proof}/download`);
  const reversal = { reversalId: ids.key, paymentId: ids.invoice, receiptId: ids.file };
  await expect(
    reverseStayPayment(
      fixture(reversal, 201).client,
      ids.branch,
      ids.stay,
      ids.invoice,
      { reason: 'r' },
      ids.key,
    ),
  ).resolves.toEqual(reversal);
  await expect(
    reverseStayPayment(
      fixture(reversal, 201).client,
      ids.branch,
      ids.stay,
      ids.file,
      { reason: 'r' },
      ids.key,
    ),
  ).rejects.toThrow();
  expect(ownReceiptPdfPath(ids.stay, ids.file)).toBe(
    `/v1/me/stays/${ids.stay}/receipts/${ids.file}/pdf`,
  );
  expect(staffReceiptPdfPath(ids.branch, ids.stay, ids.file)).toContain('/pdf');
  expect(() => ownReceiptPdfPath('bad', ids.file)).toThrow();
});
