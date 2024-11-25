import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  branchPaymentProofQueue,
  ownStayPaymentProofs,
  ownStayPaymentSummary,
  readCustomerStayInvoice,
  readCustomerStayInvoices,
  readInventoryAccess,
  reviewStayPaymentProof,
  stayPaymentInstructions,
  submitStayPaymentProof,
} from '@hsm/api-client';
import { PayRent } from './pay-rent';
import { PaymentReview } from './payment-review';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  branchPaymentProofQueue: vi.fn(),
  ownStayPaymentProofs: vi.fn(),
  ownStayPaymentSummary: vi.fn(),
  readCustomerStayInvoice: vi.fn(),
  readCustomerStayInvoices: vi.fn(),
  readInventoryAccess: vi.fn(),
  reviewStayPaymentProof: vi.fn(),
  stayPaymentInstructions: vi.fn(),
  submitStayPaymentProof: vi.fn(),
  stayPaymentProofLink: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./private-file-input', () => ({
  PrivateFileInput: ({ onReady }: { onReady: (id: string) => void }) => (
    <button type="button" onClick={() => onReady('dddddddd-dddd-4ddd-8ddd-dddddddddddd')}>
      Attach fixture proof
    </button>
  ),
}));
const ids = {
  stay: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  branch: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  invoice: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  file: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  proof: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};
const proof = {
  id: ids.proof,
  branchId: ids.branch,
  stayId: ids.stay,
  invoiceId: ids.invoice,
  invoiceNumber: 'INV-1',
  amountPaisa: 1800000,
  method: 'bank_transfer' as const,
  paidOn: '2026-10-24',
  reference: null,
  state: 'submitted' as const,
  reviewReason: null,
  paymentId: null,
  receiptId: null,
  submittedAt: '2026-10-25T10:00:00.000Z',
  reviewedAt: null,
};
function show(node: ReactNode) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>);
  return cache;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(ownStayPaymentSummary).mockResolvedValue({
    stayId: ids.stay,
    branchId: ids.branch,
    requiredDepositPaisa: 0,
    receivedDepositPaisa: 0,
    outstandingDepositPaisa: 0,
    pendingDepositPaisa: 0,
  });
  vi.mocked(readCustomerStayInvoice).mockResolvedValue({
    invoiceId: ids.invoice,
    invoiceNumber: 'INV-1',
    state: 'issued',
    outstandingPaisa: 1800000,
  } as never);
});
afterEach(cleanup);
it('PAY-001..003: resident sees own destinations, submits a proof and sees history and receipt', async () => {
  vi.mocked(stayPaymentInstructions).mockResolvedValue({
    branchId: ids.branch,
    data: [
      {
        id: ids.file,
        branchId: ids.branch,
        method: 'bank_transfer',
        accountTitle: 'Fixture Hostel',
        accountIdentifier: 'PK00',
        instructions: null,
        createdAt: proof.submittedAt,
      },
    ],
  });
  vi.mocked(readCustomerStayInvoices).mockResolvedValue({
    branchId: ids.branch,
    stayId: ids.stay,
    data: [
      {
        invoiceId: ids.invoice,
        invoiceNumber: 'INV-1',
        dueDate: '2026-11-05',
        issuedAt: proof.submittedAt,
        documentState: 'issued',
      },
    ],
    nextCursor: null,
  } as never);
  vi.mocked(ownStayPaymentProofs).mockResolvedValue({
    data: [
      { ...proof, state: 'rejected', reviewReason: 'Unreadable', reviewedAt: proof.submittedAt },
      {
        ...proof,
        id: ids.file,
        state: 'approved',
        paymentId: ids.file,
        receiptId: ids.file,
        reviewedAt: proof.submittedAt,
      },
    ],
    nextCursor: null,
  });
  vi.mocked(submitStayPaymentProof).mockResolvedValue(proof);
  show(<PayRent actorId="a" stayId={ids.stay} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pay rent' }));
  expect(await screen.findByText(/Fixture Hostel · PK00/)).toBeDefined();
  expect(await screen.findByText(/Not accepted — Unreadable/)).toBeDefined();
  expect(screen.getByRole('link', { name: 'Download receipt PDF' }).getAttribute('href')).toBe(
    `/api/v1/me/stays/${ids.stay}/receipts/${ids.file}/pdf`,
  );
  await screen.findByRole('checkbox', { name: /INV-1/ });
  fireEvent.change(screen.getByLabelText('Amount paid (PKR)'), { target: { value: '18000' } });
  fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2026-10-24' } });
  fireEvent.change(screen.getByLabelText('Transaction reference (optional)'), {
    target: { value: 'TRX-9' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Attach fixture proof' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit payment proof' }));
  expect(await screen.findByText('Proof submitted: pending verification.')).toBeDefined();
  expect(vi.mocked(submitStayPaymentProof).mock.calls[0]?.[2]).toEqual({
    invoiceId: ids.invoice,
    fileId: ids.file,
    amountPaisa: 1800000,
    method: 'bank_transfer',
    paidOn: '2026-10-24',
    reference: 'TRX-9',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Close pay rent' }));
});
it('PAY-004..007: staff see mismatch warnings and approve or reject with a reason', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: ids.branch,
    permissions: ['finance_view', 'payment_record'],
    canConfigureManagers: false,
  } as never);
  vi.mocked(branchPaymentProofQueue).mockResolvedValue({
    data: [
      {
        proof,
        residentName: 'Resident One',
        roomLabel: '101',
        bedLabel: 'A',
        invoiceOutstandingPaisa: 2000000,
        amountMismatch: true,
      },
    ],
    nextCursor: null,
  });
  vi.mocked(reviewStayPaymentProof).mockResolvedValue({
    ...proof,
    state: 'rejected',
    reviewReason: 'Not received',
    reviewedAt: proof.submittedAt,
  });
  const cache = show(<PaymentReview actorId="a" branchId={ids.branch} />);
  cache.setQueryData(['owner-dashboard', 'a', ''], { fixture: true });
  cache.setQueryData(['branch-dashboard', 'a', ids.branch], { fixture: true });
  fireEvent.click(await screen.findByRole('button', { name: 'Review payment proofs' }));
  expect(await screen.findByText(/Amount differs from the outstanding balance/)).toBeDefined();
  expect(screen.getByText('Invoice outstanding: PKR 20,000')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Reject proof for Resident One' }));
  fireEvent.change(screen.getByLabelText('Rejection reason'), {
    target: { value: 'Not received' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }));
  expect(await screen.findByText('Proof rejected; the invoice remains unpaid.')).toBeDefined();
  expect(cache.getQueryState(['owner-dashboard', 'a', ''])?.isInvalidated).toBe(true);
  expect(cache.getQueryState(['branch-dashboard', 'a', ids.branch])?.isInvalidated).toBe(true);
  expect(vi.mocked(reviewStayPaymentProof).mock.calls[0]?.[3]).toEqual({
    decision: 'reject',
    reason: 'Not received',
  });
  vi.mocked(reviewStayPaymentProof).mockResolvedValue({
    ...proof,
    state: 'approved',
    paymentId: ids.file,
    receiptId: ids.file,
    reviewedAt: proof.submittedAt,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Approve payment for Resident One' }));
  expect(await screen.findByText('Payment recorded and receipt issued.')).toBeDefined();
});
it('PAY-004 / SEC-003: hidden without finance_view; view-only without payment_record', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: ids.branch,
    permissions: [],
    canConfigureManagers: false,
  } as never);
  show(<PaymentReview actorId="a" branchId={ids.branch} />);
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Review payment proofs' })).toBeNull();
  cleanup();
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: ids.branch,
    permissions: ['finance_view'],
    canConfigureManagers: false,
  } as never);
  vi.mocked(branchPaymentProofQueue).mockResolvedValue({ data: [], nextCursor: null });
  show(<PaymentReview actorId="a" branchId={ids.branch} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review payment proofs' }));
  expect(await screen.findByText('No proofs are waiting.')).toBeDefined();
  expect(screen.getByText(/Approving needs the payment grant/)).toBeDefined();
});
