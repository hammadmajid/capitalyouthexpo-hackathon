import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  checkoutStay,
  extendStay,
  readBranchOccupancy,
  readFinalStatement,
  readInventoryAccess,
  readStaySettlement,
  recordStayFundMovement,
  transferStay,
} from '@hsm/api-client';
import { StayLifecycle } from './stay-lifecycle';
import { SettlementView } from './settlement-view';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  checkoutStay: vi.fn(),
  extendStay: vi.fn(),
  readBranchOccupancy: vi.fn(),
  readFinalStatement: vi.fn(),
  readInventoryAccess: vi.fn(),
  readStaySettlement: vi.fn(),
  recordStayFundMovement: vi.fn(),
  transferStay: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
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
  stayState: 'notice_given' as const,
  invoices: [],
  invoicesTruncated: false,
  outstandingPaisa: 1800000,
  deposit: { ...zero, receivedPaisa: 500000, heldPaisa: 500000 },
  advance: { ...zero, heldPaisa: 0 },
  netPayablePaisa: 1300000,
  netRefundablePaisa: 0,
  fundSources: [
    { paymentId: ids.payment, receiptNumber: 'RCP-1', depositPaisa: 500000, advanceCreditPaisa: 0 },
  ],
  asOf: '2026-10-25',
};
function show(node: ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: ids.branch,
    permissions: ['stay_manage', 'finance_view', 'checkout_manage'],
    canConfigureManagers: false,
  } as never);
  vi.mocked(readStaySettlement).mockResolvedValue(settlement);
  vi.mocked(readBranchOccupancy).mockResolvedValue({
    branchId: ids.branch,
    on: '2026-10-25',
    totals: { beds: 1, occupied: 0, blocked: 0, reserved: 0, unavailable: 0, available: 1 },
    data: [
      {
        id: ids.room,
        label: '102',
        roomTypeId: ids.room,
        status: 'active',
        beds: [
          {
            id: ids.bed,
            label: 'B',
            ordinal: 1,
            status: 'active',
            state: 'available',
            occupant: null,
          },
        ],
      },
    ],
    nextCursor: null,
  });
});
afterEach(cleanup);
it('RES-005 / OUT-003..006: staff transfer, extend, deduct and check out with the Stay version', async () => {
  vi.mocked(transferStay).mockResolvedValue({} as never);
  vi.mocked(extendStay).mockResolvedValue({} as never);
  vi.mocked(recordStayFundMovement).mockResolvedValue({} as never);
  vi.mocked(checkoutStay).mockResolvedValue({} as never);
  show(
    <StayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={3}
      closed={false}
      permissions={['stay_manage', 'finance_view', 'checkout_manage']}
    />,
  );
  expect(await screen.findByText('PKR 13,000')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Lifecycle reason'), { target: { value: 'Requested' } });
  await screen.findByRole('option', { name: '102 · B' });
  fireEvent.change(screen.getByLabelText('Transfer target bed'), { target: { value: ids.bed } });
  fireEvent.click(screen.getByRole('button', { name: 'Transfer resident' }));
  await waitFor(() => expect(transferStay).toHaveBeenCalled());
  expect(vi.mocked(transferStay).mock.calls[0]?.[3]).toEqual({
    expectedVersion: 3,
    target: { kind: 'bed', roomId: ids.room, bedId: ids.bed },
    reason: 'Requested',
  });
  fireEvent.change(screen.getByLabelText('Lifecycle reason'), { target: { value: 'Extended' } });
  fireEvent.change(screen.getByLabelText('New expected departure'), {
    target: { value: '2027-01-25' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change departure date' }));
  await waitFor(() => expect(extendStay).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Lifecycle reason'), {
    target: { value: 'Broken chair' },
  });
  await screen.findByRole('option', { name: /RCP-1/ });
  fireEvent.change(screen.getByLabelText('Fund source payment'), {
    target: { value: ids.payment },
  });
  fireEvent.change(screen.getByLabelText('Fund amount (PKR)'), { target: { value: '200' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record fund action' }));
  await waitFor(() => expect(recordStayFundMovement).toHaveBeenCalled());
  expect(vi.mocked(recordStayFundMovement).mock.calls[0]?.[3]).toEqual({
    paymentId: ids.payment,
    movement: { kind: 'deposit_deduct', amountPaisa: 20000, reason: 'Broken chair' },
  });
  fireEvent.change(screen.getByLabelText('Fund action'), { target: { value: 'deposit_refund' } });
  fireEvent.change(screen.getByLabelText('Lifecycle reason'), { target: { value: 'Refund' } });
  fireEvent.change(screen.getByLabelText('External refund reference (optional)'), {
    target: { value: 'BANK-1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record fund action' }));
  await waitFor(() => expect(recordStayFundMovement).toHaveBeenCalledTimes(2));
  expect(vi.mocked(recordStayFundMovement).mock.calls[1]?.[3]).toMatchObject({
    movement: { kind: 'deposit_refund', externalReference: 'BANK-1' },
  });
  fireEvent.change(screen.getByLabelText('Lifecycle reason'), { target: { value: 'Left' } });
  fireEvent.click(screen.getByRole('button', { name: 'Complete checkout' }));
  await waitFor(() => expect(checkoutStay).toHaveBeenCalled());
  expect(vi.mocked(checkoutStay).mock.calls[0]?.[3]).toEqual({
    expectedVersion: 3,
    reason: 'Left',
    applyAvailableDeposit: false,
  });
});
it('OUT-005 / STAY-004: closed Stays show the frozen statement; errors are safe', async () => {
  vi.mocked(readFinalStatement).mockResolvedValue({
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
      current: {
        ...settlement,
        stayState: 'completed',
        netPayablePaisa: 0,
        netRefundablePaisa: 200000,
      },
    },
  });
  show(
    <StayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={4}
      closed
      permissions={[]}
    />,
  );
  expect(await screen.findByRole('heading', { name: 'Final statement' })).toBeDefined();
  // P9-FIX-04: later records sit beside the frozen statement; owed is not shown as refunded.
  expect(screen.getByText(/Deposit refund recorded PKR 3,000 · ref BANK-9/)).toBeDefined();
  expect(screen.getByText(/refund still owed by the hostel PKR 2,000/)).toBeDefined();
  cleanup();
  vi.mocked(readStaySettlement).mockRejectedValue(new Error('private detail'));
  show(<SettlementView actorId="a" stayId={ids.stay} closed={false} />);
  expect((await screen.findByRole('alert')).textContent).not.toContain('private detail');
});
it('CHG-010: actions follow the live grants', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: ids.branch,
    permissions: ['stay_manage'],
    canConfigureManagers: false,
  } as never);
  show(
    <StayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={1}
      closed={false}
      permissions={['stay_manage']}
    />,
  );
  expect(await screen.findByRole('button', { name: 'Transfer resident' })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Complete checkout' })).toBeNull();
});
it('P9-FIX-01/03: repricing needs rent grants and resident agreement; deposit applies at checkout', async () => {
  vi.mocked(transferStay).mockResolvedValue({
    agreement: {
      previousRentPaisa: 1800000,
      rentAmountPaisa: 2300000,
      effectiveFrom: '2026-11-01',
    },
  } as never);
  vi.mocked(checkoutStay).mockResolvedValue({ depositApplied: [{ amountPaisa: 500000 }] } as never);
  show(
    <StayLifecycle
      actorId="a"
      branchId={ids.branch}
      stayId={ids.stay}
      version={3}
      closed={false}
      permissions={[
        'stay_manage',
        'rent_manage',
        'finance_view',
        'checkout_manage',
        'payment_record',
      ]}
    />,
  );
  fireEvent.change(screen.getByLabelText('Lifecycle reason'), { target: { value: 'Bigger bed' } });
  await screen.findByRole('option', { name: '102 · B' });
  fireEvent.change(screen.getByLabelText('Transfer target bed'), { target: { value: ids.bed } });
  fireEvent.click(screen.getByLabelText(/Change the monthly rent/));
  fireEvent.change(screen.getByLabelText('New monthly rent (PKR)'), { target: { value: '23000' } });
  const transfer = screen.getByRole('button', { name: 'Transfer resident' });
  expect((transfer as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/resident agreed/));
  fireEvent.click(transfer);
  await waitFor(() => expect(transferStay).toHaveBeenCalled());
  expect(vi.mocked(transferStay).mock.calls[0]?.[3]).toMatchObject({
    repricing: { rentAmountPaisa: 2300000, residentAgreed: true },
  });
  expect(
    await screen.findByText(/Rent changes from PKR 18,000 to PKR 23,000 from 2026-11-01/),
  ).toBeDefined();
  fireEvent.change(screen.getByLabelText('Lifecycle reason'), { target: { value: 'Left' } });
  fireEvent.click(screen.getByLabelText(/Apply the held deposit/));
  fireEvent.click(screen.getByRole('button', { name: 'Complete checkout' }));
  await waitFor(() => expect(checkoutStay).toHaveBeenCalled());
  expect(vi.mocked(checkoutStay).mock.calls[0]?.[3]).toMatchObject({ applyAvailableDeposit: true });
  expect(await screen.findByText(/PKR 5,000 of deposit applied to rent/)).toBeDefined();
});
