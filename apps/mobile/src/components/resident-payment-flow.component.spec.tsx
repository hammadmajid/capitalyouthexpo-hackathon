import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  branchPaymentProofQueue,
  readStaffStayReceipt,
  reviewStayPaymentProof,
  stayPaymentProofLink,
  readStayResidentPhoto,
} from '@hsm/api-client';
import { NativePaymentReview } from './payment-review';
import { StayResidentPhoto } from './stay-resident-photo';
jest.mock('../lib/runtime', () => ({ actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000009' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  branchPaymentProofQueue: jest.fn(),
  readStaffStayReceipt: jest.fn(),
  reviewStayPaymentProof: jest.fn(),
  stayPaymentProofLink: jest.fn(),
  readStayResidentPhoto: jest.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001';
const proof = {
  id,
  branchId: id,
  stayId: id,
  invoiceId: id,
  invoiceNumber: 'INV-1',
  amountPaisa: 1001,
  depositPaisa: 0,
  method: 'bank_transfer',
  paidOn: '2026-11-20',
  reference: null,
  state: 'submitted',
  reviewReason: null,
  paymentId: null,
  receiptId: null,
  submittedAt: '2026-11-20T12:00:00Z',
  reviewedAt: null,
} as const;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(branchPaymentProofQueue).mockResolvedValue({
    data: [
      {
        proof,
        residentName: 'Ali',
        roomLabel: 'A-1',
        bedLabel: 'B-1',
        invoiceOutstandingPaisa: 1001,
        amountMismatch: false,
      },
    ],
    nextCursor: null,
  });
  jest.mocked(stayPaymentProofLink).mockResolvedValue({
    url: 'https://storage.example.test/proof.png',
    expiresAt: '2026-11-20T12:01:00Z',
  });
});
async function show(canDecide = true) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={cache}>
      <NativePaymentReview
        actorId="actor"
        branchId={id}
        stayId={id}
        initiallyOpen
        canDecide={canDecide}
      />
    </QueryClientProvider>,
  );
}
it('PAY-004..009: opens only this resident’s invoice picture and creates an exportable receipt after approval', async () => {
  jest.mocked(reviewStayPaymentProof).mockResolvedValue({
    ...proof,
    state: 'approved',
    paymentId: id,
    receiptId: id,
    reviewedAt: '2026-11-20T12:00:30Z',
  });
  jest.mocked(readStaffStayReceipt).mockResolvedValue({
    receiptId: id,
    receiptNumber: 'R-1',
    issuedAt: '2026-11-20T12:00:30Z',
    reversed: false,
    snapshot: {
      version: 1,
      currency: 'PKR',
      paymentId: id,
      branchId: id,
      stayId: id,
      residentName: 'Ali',
      hostelName: 'Hostel',
      branchName: 'Branch',
      amountPaisa: 1001,
      method: 'bank_transfer',
      transactionReference: null,
      paidOn: '2026-11-20',
      approvedAt: '2026-11-20T12:00:30Z',
      allocations: [{ invoiceId: id, invoiceNumber: 'INV-1', amountPaisa: 1001 }],
      distribution: { allocatedPaisa: 1001, depositPaisa: 0, advanceCreditPaisa: 0 },
    },
  });
  await show();
  expect((await screen.findByLabelText('Submitted payment proof picture')).props.source.uri).toBe(
    'https://storage.example.test/proof.png',
  );
  expect(branchPaymentProofQueue).toHaveBeenCalledWith({}, id, { state: 'submitted', stayId: id });
  await fireEvent.press(screen.getByRole('button', { name: 'Approve payment for Ali' }));
  expect(await screen.findByText('Payment approved')).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Save image to gallery' })).toBeTruthy();
  expect(readStaffStayReceipt).toHaveBeenCalledWith({}, id, id, id);
});
it('PAY-007 / ACC-004: rejection needs a reason, shows rejection and does not create a receipt', async () => {
  jest.mocked(reviewStayPaymentProof).mockResolvedValue({
    ...proof,
    state: 'rejected',
    reviewReason: 'Not received',
    reviewedAt: '2026-11-20T12:00:30Z',
  });
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: 'Reject proof for Ali' }));
  expect(
    screen.getByRole('button', { name: 'Confirm rejection' }).props.accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('Rejection reason'), 'Not received');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm rejection' }));
  expect(await screen.findByText('Payment rejected')).toBeTruthy();
  expect(readStaffStayReceipt).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Save image to gallery' })).toBeNull();
});
it('SEC-003: finance read access alone never shows approve or reject', async () => {
  await show(false);
  await screen.findByLabelText('Submitted payment proof picture');
  expect(screen.queryByRole('button', { name: 'Approve payment for Ali' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reject proof for Ali' })).toBeNull();
});
it('RES-004: a newly uploaded linked customer photo replaces the fallback on refresh', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.mocked(readStayResidentPhoto).mockResolvedValue({ url: null, expiresAt: null });
  await render(
    <QueryClientProvider client={cache}>
      <StayResidentPhoto actorId="actor" branchId={id} stayId={id} />
    </QueryClientProvider>,
  );
  await screen.findByLabelText('Resident avatar');
  jest.mocked(readStayResidentPhoto).mockResolvedValue({
    url: 'https://storage.example.test/new-avatar.png',
    expiresAt: '2026-11-20T12:01:00Z',
  });
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['stay-resident-photo', 'actor', id, id] });
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Resident profile photo').props.source.uri).toBe(
      'https://storage.example.test/new-avatar.png',
    ),
  );
});
