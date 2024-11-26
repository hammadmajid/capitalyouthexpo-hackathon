jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  branchPaymentProofQueue,
  ownStayPaymentProofs,
  ownStayPaymentSummary,
  readCustomerStayInvoices,
  readCustomerStayInvoice,
  readStayTransport,
  readCustomerStayReceipt,
  reviewStayPaymentProof,
  stayPaymentInstructions,
  submitStayPaymentProof,
} from '@hsm/api-client';
import { NativePayRent } from './pay-rent';
import { NativePaymentReview } from './payment-review';
import { pickDate } from '../test-utils/pick-date';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('./private-file-picker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    PrivateFilePicker: ({ onReady }: { onReady: (id: string) => void }) => (
      <Pressable
        accessibilityRole="button"
        onPress={() => onReady('dddddddd-dddd-4ddd-8ddd-dddddddddddd')}
      >
        <Text>Attach fixture proof</Text>
      </Pressable>
    ),
  };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  branchPaymentProofQueue: jest.fn(),
  ownStayPaymentProofs: jest.fn(),
  ownStayPaymentSummary: jest.fn(),
  readCustomerStayInvoices: jest.fn(),
  readCustomerStayInvoice: jest.fn(),
  readStayTransport: jest.fn(),
  readCustomerStayReceipt: jest.fn(),
  reviewStayPaymentProof: jest.fn(),
  stayPaymentInstructions: jest.fn(),
  submitStayPaymentProof: jest.fn(),
  stayPaymentProofLink: jest.fn(),
}));
const ids = {
  stay: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  branch: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  invoice: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  transport: 'ffffffff-ffff-4fff-8fff-000000000001',
  mess: 'ffffffff-ffff-4fff-8fff-000000000002',
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
async function show(node: ReactNode) {
  await render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(ownStayPaymentSummary).mockResolvedValue({
    stayId: ids.stay,
    branchId: ids.branch,
    requiredDepositPaisa: 0,
    receivedDepositPaisa: 0,
    outstandingDepositPaisa: 0,
    pendingDepositPaisa: 0,
  });
});
it('PAY-001..003 / CHG-055: resident pays security, rent and transport together; excess is blocked', async () => {
  jest.mocked(ownStayPaymentSummary).mockResolvedValue({
    stayId: ids.stay,
    branchId: ids.branch,
    requiredDepositPaisa: 1000000,
    receivedDepositPaisa: 0,
    outstandingDepositPaisa: 1000000,
    pendingDepositPaisa: 0,
  });
  jest.mocked(stayPaymentInstructions).mockResolvedValue({
    branchId: ids.branch,
    data: [
      {
        id: ids.file,
        branchId: ids.branch,
        method: 'jazzcash',
        accountTitle: 'Fixture Hostel',
        accountIdentifier: '0300',
        instructions: null,
        createdAt: proof.submittedAt,
      },
    ],
  } as never);
  jest.mocked(readCustomerStayInvoices).mockResolvedValue({
    data: [
      {
        invoiceId: ids.invoice,
        invoiceNumber: 'INV-1',
        dueDate: '2026-11-05',
        issuedAt: proof.submittedAt,
        documentState: 'issued',
      },
      {
        invoiceId: ids.transport,
        invoiceNumber: 'INV-T',
        dueDate: '2026-11-10',
        issuedAt: proof.submittedAt,
        documentState: 'issued',
      },
      {
        invoiceId: ids.mess,
        invoiceNumber: 'INV-M',
        dueDate: '2026-11-07',
        issuedAt: proof.submittedAt,
        documentState: 'issued',
        kind: 'mess',
      },
    ],
  } as never);
  jest.mocked(readCustomerStayInvoice).mockImplementation(
    async (_client, _stay, invoiceId) =>
      ({
        state: 'issued',
        outstandingPaisa:
          invoiceId === ids.transport ? 300000 : invoiceId === ids.mess ? 500000 : 1800000,
      }) as never,
  );
  jest.mocked(readStayTransport).mockResolvedValue({
    data: [{ billing: { invoiceId: ids.transport } }],
    nextCursor: null,
  } as never);
  jest.mocked(ownStayPaymentProofs).mockResolvedValue({
    data: [
      {
        ...proof,
        state: 'approved',
        paymentId: ids.file,
        receiptId: ids.file,
        reviewedAt: proof.submittedAt,
      },
    ],
    nextCursor: null,
  } as never);
  jest.mocked(readCustomerStayReceipt).mockResolvedValue({
    receiptId: ids.file,
    receiptNumber: 'RCP-1',
    issuedAt: '2026-10-24T10:00:00.000Z',
    reversed: false,
    snapshot: {
      version: 1,
      currency: 'PKR',
      paymentId: ids.file,
      branchId: ids.branch,
      stayId: ids.stay,
      residentName: 'Resident One',
      branchName: 'Fixture Branch',
      method: 'bank_transfer',
      transactionReference: null,
      approvedAt: '2026-10-24T10:00:00.000Z',
      allocations: [{ invoiceId: ids.invoice, invoiceNumber: 'INV-1', amountPaisa: 2100000 }],
      amountPaisa: 2100000,
      hostelName: 'Fixture Hostel',
      distribution: { depositPaisa: 0, allocatedPaisa: 2100000, advanceCreditPaisa: 0 },
      paidOn: '2026-10-24',
    },
  } as never);
  jest.mocked(submitStayPaymentProof).mockResolvedValue(proof as never);
  await show(<NativePayRent actorId="a" stayId={ids.stay} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Pay rent' }));
  expect(await screen.findByText(/jazzcash: Fixture Hostel · 0300/)).toBeTruthy();
  // Both open bills are ticked and the amount is their total.
  const rent = await screen.findByRole('checkbox', { name: 'Rent, due 2026-11-05, PKR 18,000' });
  const transport = screen.getByRole('checkbox', {
    name: 'Transport, due 2026-11-10, PKR 3,000',
  });
  expect(rent.props.accessibilityState).toMatchObject({ checked: true });
  expect(transport.props.accessibilityState).toMatchObject({ checked: true });
  // CHG-050: a mess bill is named Mess (not Rent); untick it to pay only rent + transport.
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Mess, due 2026-11-07, PKR 5,000' }));
  expect(screen.getByLabelText('Amount paid (PKR)').props.value).toBe('31,000');
  expect(screen.getByText('Total PKR 31,000 · one payment')).toBeTruthy();
  await pickDate('Payment date', '2026-10-24');
  await fireEvent.press(screen.getByRole('button', { name: 'Paid by easypaisa' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Attach fixture proof' }));
  await fireEvent.changeText(screen.getByLabelText('Amount paid (PKR)'), '31001');
  expect(
    screen.getByRole('button', { name: 'Submit payment proof' }).props.accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('Amount paid (PKR)'), '31000');
  await fireEvent.press(screen.getByRole('button', { name: 'Submit payment proof' }));
  expect(await screen.findByText('Proof submitted: pending verification.')).toBeTruthy();
  expect(jest.mocked(submitStayPaymentProof).mock.calls[0]?.[2]).toEqual({
    invoiceId: ids.invoice,
    alsoInvoiceIds: [ids.transport],
    fileId: ids.file,
    amountPaisa: 3100000,
    depositPaisa: 1000000,
    method: 'easypaisa',
    paidOn: '2026-10-24',
  });
  await fireEvent.press(screen.getByRole('button', { name: 'View receipt for INV-1' }));
  expect(await screen.findByText('Receipt RCP-1')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close pay rent' }));
});
it('PAY-004..007: staff review shows mismatch and records approve or reject', async () => {
  jest.mocked(branchPaymentProofQueue).mockResolvedValue({
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
  } as never);
  jest.mocked(reviewStayPaymentProof).mockResolvedValue({
    ...proof,
    state: 'rejected',
    reviewReason: 'Not received',
    reviewedAt: proof.submittedAt,
  } as never);
  await show(<NativePaymentReview actorId="a" branchId={ids.branch} canDecide />);
  await fireEvent.press(screen.getByRole('button', { name: 'Review payment proofs' }));
  expect(await screen.findByText('Amount differs from the outstanding balance.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Reject proof for Resident One' }));
  await fireEvent.changeText(screen.getByLabelText('Rejection reason'), 'Not received');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm rejection' }));
  expect(await screen.findByText('Proof rejected; the invoice remains unpaid.')).toBeTruthy();
  jest.mocked(reviewStayPaymentProof).mockResolvedValue({
    ...proof,
    state: 'approved',
    paymentId: ids.file,
    receiptId: ids.file,
    reviewedAt: proof.submittedAt,
  } as never);
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Approve payment for Resident One' }),
  );
  await waitFor(() => expect(reviewStayPaymentProof).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Payment recorded and receipt issued.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close payment proofs' }));
});
it('SEC-003: a view-only reviewer has no decision controls', async () => {
  jest.mocked(branchPaymentProofQueue).mockResolvedValue({ data: [], nextCursor: null } as never);
  await show(<NativePaymentReview actorId="a" branchId={ids.branch} canDecide={false} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Review payment proofs' }));
  expect(await screen.findByText('No proofs waiting')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Approve payment/ })).toBeNull();
});
