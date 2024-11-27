import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  checkoutStay,
  extendStay,
  readBranchOccupancy,
  readFinalStatement,
  readStaySettlement,
  recordStayFundMovement,
  transferStay,
} from '@hsm/api-client';
import { NativeSettlement, NativeStayLifecycle } from './stay-lifecycle';
import { pickDate } from '../test-utils/pick-date';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'ffffffff-ffff-4fff-8fff-ffffffffffff' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  checkoutStay: jest.fn(),
  extendStay: jest.fn(),
  readBranchOccupancy: jest.fn(),
  readFinalStatement: jest.fn(),
  readStaySettlement: jest.fn(),
  recordStayFundMovement: jest.fn(),
  transferStay: jest.fn(),
}));
const ids = {
  branch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  stay: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  room: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  bed: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  payment: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
};
const zero = { receivedPaisa: 0, appliedToRentPaisa: 0, deductedPaisa: 0, refundedPaisa: 0 };
const settlement = {
  stayId: ids.stay,
  branchId: ids.branch,
  stayState: 'active',
  invoices: [],
  invoicesTruncated: false,
  outstandingPaisa: 0,
  deposit: { ...zero, receivedPaisa: 500000, heldPaisa: 500000 },
  advance: { ...zero, heldPaisa: 0 },
  netPayablePaisa: 0,
  netRefundablePaisa: 500000,
  fundSources: [
    { paymentId: ids.payment, receiptNumber: 'RCP-1', depositPaisa: 500000, advanceCreditPaisa: 0 },
  ],
  asOf: '2026-10-25',
};
async function show(node: ReactNode) {
  await render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readStaySettlement).mockResolvedValue(settlement as never);
  jest.mocked(readBranchOccupancy).mockResolvedValue({
    data: [
      {
        id: ids.room,
        label: '102',
        beds: [{ id: ids.bed, label: 'B', state: 'available' }],
      },
    ],
  } as never);
});
it('OUT-005: checkout hides bed transfers and does not load transfer choices', async () => {
  await show(
    <NativeStayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={2}
      closed={false}
      canStay
      canTransfer={false}
      canExtend
      canSettle
    />,
  );
  expect(screen.queryByText('Move bed')).toBeNull();
  expect(readBranchOccupancy).not.toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: 'Complete checkout' })).toBeTruthy();
});
it('RES-005 / OUT-003..006: staff act with reason and Stay version', async () => {
  jest.mocked(transferStay).mockResolvedValue({} as never);
  jest.mocked(extendStay).mockResolvedValue({} as never);
  jest.mocked(recordStayFundMovement).mockResolvedValue({} as never);
  jest.mocked(checkoutStay).mockResolvedValue({} as never);
  await show(
    <NativeStayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={2}
      closed={false}
      canStay
      canExtend
      canSettle
    />,
  );
  expect(await screen.findByLabelText('Hostel still owes back: PKR 5,000')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Lifecycle reason'), 'Requested');
  await fireEvent.press(await screen.findByRole('button', { name: 'Transfer to room 102 bed B' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Yes' }));
  await waitFor(() => expect(transferStay).toHaveBeenCalled());
  expect(jest.mocked(transferStay).mock.calls[0]?.[3]).toEqual({
    expectedVersion: 2,
    target: { kind: 'bed', roomId: ids.room, bedId: ids.bed },
    reason: 'Requested',
  });
  await pickDate('New expected departure', '2027-01-25');
  await fireEvent.press(screen.getByRole('button', { name: 'Change departure date' }));
  await waitFor(() => expect(extendStay).toHaveBeenCalled());
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Use receipt RCP-1 (deposit PKR 5,000)' }),
  );
  await fireEvent.changeText(screen.getByLabelText('Deduction amount (PKR)'), '100');
  await fireEvent.press(screen.getByRole('button', { name: 'Deduct from deposit' }));
  await waitFor(() => expect(recordStayFundMovement).toHaveBeenCalled());
  expect(jest.mocked(recordStayFundMovement).mock.calls[0]?.[3]).toEqual({
    paymentId: ids.payment,
    movement: { kind: 'deposit_deduct', amountPaisa: 10000, reason: 'Requested' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Complete checkout' }));
  expect(checkoutStay).not.toHaveBeenCalled();
  await fireEvent.press(await screen.findByRole('button', { name: 'Yes' }));
  await waitFor(() => expect(checkoutStay).toHaveBeenCalled());
});
it('STAY-004 / OUT-005: residents see the frozen statement after checkout; failures are safe', async () => {
  jest.mocked(readFinalStatement).mockResolvedValue({
    statementId: ids.payment,
    createdAt: '2026-10-25T10:00:00.000Z',
    statement: { ...settlement, stayState: 'completed' },
    afterCheckout: {
      movements: [
        {
          kind: 'deposit_refund',
          amountPaisa: 300000,
          recordedAt: '2026-10-26T10:00:00.000Z',
          externalReference: 'BANK-9',
        },
      ],
      current: { ...settlement, stayState: 'completed', netRefundablePaisa: 200000 },
    },
  } as never);
  await show(<NativeSettlement actorId="a" stayId={ids.stay} closed />);
  expect(await screen.findByText('Final statement')).toBeTruthy();
  expect(readStaySettlement).not.toHaveBeenCalled();
  // P9-FIX-04: later records sit beside the frozen statement.
  expect(screen.getByText(/Deposit refund recorded PKR 3,000 · ref BANK-9/)).toBeTruthy();
  expect(screen.getByText(/Refund still owed by the hostel: PKR 2,000/)).toBeTruthy();
  jest.mocked(readStaySettlement).mockRejectedValue(new Error('private detail'));
  await show(<NativeSettlement actorId="b" stayId={ids.stay} closed={false} />);
  await waitFor(() => expect(readStaySettlement).toHaveBeenCalled());
  expect(screen.queryByText(/private detail/)).toBeNull();
});
it('CHG-010: closed staff view shows the statement; view-only grants have no actions', async () => {
  jest.mocked(readFinalStatement).mockResolvedValue({
    statementId: ids.payment,
    createdAt: '2026-10-25T10:00:00.000Z',
    statement: { ...settlement, stayState: 'completed' },
    afterCheckout: {
      movements: [
        {
          kind: 'deposit_refund',
          amountPaisa: 300000,
          recordedAt: '2026-10-26T10:00:00.000Z',
          externalReference: 'BANK-9',
        },
      ],
      current: { ...settlement, stayState: 'completed', netRefundablePaisa: 200000 },
    },
  } as never);
  await show(
    <NativeStayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={3}
      closed
      canStay
      canSettle
    />,
  );
  expect(await screen.findByText('Final statement')).toBeTruthy();
  await show(
    <NativeStayLifecycle
      actorId="c"
      branchId={ids.branch}
      stayId={ids.stay}
      version={3}
      closed={false}
      canStay={false}
      canSettle={false}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Complete checkout' })).toBeNull();
});
it('P9-FIX-01/03: repricing needs the resident agreement; deposit applies at checkout', async () => {
  jest.mocked(transferStay).mockResolvedValue({
    agreement: {
      previousRentPaisa: 1800000,
      rentAmountPaisa: 2300000,
      effectiveFrom: '2026-11-01',
    },
  } as never);
  jest
    .mocked(checkoutStay)
    .mockResolvedValue({ depositApplied: [{ amountPaisa: 500000 }] } as never);
  await show(
    <NativeStayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={2}
      closed={false}
      canStay
      canSettle
      canReprice
      canApplyDeposit
    />,
  );
  await fireEvent.changeText(screen.getByLabelText('Lifecycle reason'), 'Bigger bed');
  await fireEvent.changeText(
    screen.getByLabelText('New monthly rent with transfer (PKR, optional)'),
    '23000',
  );
  const transfer = await screen.findByRole('button', { name: 'Transfer to room 102 bed B' });
  await fireEvent.press(transfer);
  expect(transferStay).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Resident agreed to the new rent' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Transfer to room 102 bed B' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Yes' }));
  await waitFor(() => expect(transferStay).toHaveBeenCalled());
  expect(jest.mocked(transferStay).mock.calls[0]?.[3]).toMatchObject({
    repricing: { rentAmountPaisa: 2300000, residentAgreed: true },
  });
  expect(await screen.findByText(/Rent changes from PKR 18,000 to PKR 23,000/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Apply held deposit to unpaid rent' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Complete checkout' }));
  expect(checkoutStay).not.toHaveBeenCalled();
  await fireEvent.press(await screen.findByRole('button', { name: 'Yes' }));
  await waitFor(() => expect(checkoutStay).toHaveBeenCalled());
  expect(jest.mocked(checkoutStay).mock.calls[0]?.[3]).toMatchObject({
    applyAvailableDeposit: true,
  });
});

it('ACC-002: a stay-only manager never requests closed-stay finances', async () => {
  await show(
    <NativeStayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={2}
      closed
      canStay
      canSettle={false}
    />,
  );
  await waitFor(() => expect(readFinalStatement).not.toHaveBeenCalled());
  expect(readStaySettlement).not.toHaveBeenCalled();
});

it('ACC-002: finance-only readers can see settlement without checkout or fund actions', async () => {
  await show(
    <NativeStayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={2}
      closed={false}
      canStay
      canSettle={false}
      canViewFinance
    />,
  );
  expect(await screen.findByLabelText('Outstanding invoices: PKR 0')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Complete checkout' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Deduct from deposit' })).toBeNull();
});
