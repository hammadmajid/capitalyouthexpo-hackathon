import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createStaff,
  listStaff,
  readStaff,
  readStaffDashboard,
  recordStaffPayment,
  reverseStaffPayment,
} from '@hsm/api-client';
import type { StaffDetail, StaffMember, StaffSalary } from '@hsm/contracts';
import { StaffWorkspace } from './staff-workspace';
import { staffBody } from './staff-form';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  createStaff: vi.fn(),
  listStaff: vi.fn(),
  readStaff: vi.fn(),
  readStaffDashboard: vi.fn(),
  recordStaffPayment: vi.fn(),
  reverseStaffPayment: vi.fn(),
}));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  staffId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  salaryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  paymentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const salary: StaffSalary = {
  id: salaryId,
  staffId,
  month: '2026-11-01',
  amountPaisa: 3_000_000,
  paidPaisa: 1_000_000,
  outstandingPaisa: 2_000_000,
  dueOn: '2026-11-05',
  timing: 'overdue',
  partial: true,
};
const member = (withSalary: boolean): StaffMember => ({
  id: staffId,
  branchId,
  fullName: 'Asad Khan',
  phone: '+923001234567',
  jobTitle: 'cook',
  customTitle: null,
  startsOn: '2026-01-10',
  endsOn: null,
  status: 'active',
  version: 3,
  salary: withSalary ? salary : null,
});
function detail(payroll: boolean): StaffDetail {
  return {
    staff: member(payroll),
    payroll,
    terms: payroll
      ? [
          {
            id: salaryId,
            version: 1,
            amountPaisa: 3_000_000,
            dueDay: 5,
            effectiveFrom: '2026-01-01',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]
      : [],
    salaries: payroll ? [salary] : [],
    payments: payroll
      ? [
          {
            id: paymentId,
            salaryId,
            kind: 'payment',
            amountPaisa: 1_000_000,
            paidOn: '2026-11-06',
            method: 'cash',
            reference: null,
            note: null,
            reversesPaymentId: null,
            reversed: false,
            recordedAt: '2026-11-06T00:00:00.000Z',
          },
        ]
      : [],
    agreements: [],
  };
}
function serve(payroll: boolean) {
  vi.mocked(readStaffDashboard).mockResolvedValue({
    branchId,
    month: '2026-11-01',
    today: '2026-11-22',
    activeStaff: 1,
    payroll: payroll
      ? {
          paid: 0,
          unpaid: 0,
          due: 0,
          overdue: 1,
          partial: 1,
          needsAmount: 0,
          expectedPaisa: 3_000_000,
          paidPaisa: 1_000_000,
          outstandingPaisa: 2_000_000,
          recentPayments: [],
        }
      : null,
  });
  vi.mocked(listStaff).mockResolvedValue({ data: [member(payroll)], nextCursor: null, payroll });
  vi.mocked(readStaff).mockResolvedValue(detail(payroll));
}
function show(canSetUp: boolean) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <StaffWorkspace actorId="actor" branchId={branchId} canSetUp={canSetUp} />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it('CHG-039: without payroll access a manager sees staff but no money and cannot add staff', async () => {
  serve(false);
  show(false);
  expect(await screen.findByText('Asad Khan')).toBeTruthy();
  expect(screen.queryByText('Left to pay')).toBeNull();
  expect(screen.queryByText(/PKR/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add staff' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open Asad Khan' }));
  expect(await screen.findByText(/Cook · since 2026-01-10 · 03001234567/)).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Salary' })).toBeNull();
});
it('CHG-039: with payroll access the dashboard shows money and overdue partial salary', async () => {
  serve(true);
  show(false);
  expect(await screen.findByText('Left to pay')).toBeTruthy();
  expect(await screen.findAllByText('Overdue')).toHaveLength(2);
  expect(screen.getByText('Partly paid')).toBeTruthy();
});
it('CHG-039: the owner adds staff with first salary terms in integer paisa', async () => {
  serve(true);
  vi.mocked(createStaff).mockResolvedValue(member(true));
  show(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Add staff' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' Bilal ' } });
  fireEvent.change(screen.getByLabelText('Job'), { target: { value: 'security_guard' } });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-15' } });
  await waitFor(() => expect(screen.getByLabelText('Monthly salary, PKR (optional)')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Monthly salary, PKR (optional)'), {
    target: { value: '30,000' },
  });
  fireEvent.change(screen.getByLabelText('Pay day'), { target: { value: '29' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Salary day must be 1 to 28.')).toBeTruthy();
  expect(createStaff).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Pay day'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(1));
  expect(vi.mocked(createStaff).mock.calls[0]?.[2]).toEqual({
    fullName: 'Bilal',
    jobTitle: 'security_guard',
    startsOn: '2026-11-15',
    salary: { amountPaisa: 3_000_000, dueDay: 5, effectiveFrom: '2026-11-01' },
  });
});
it('CHG-039: a salary payment cannot exceed what is owed and is sent once with one key', async () => {
  serve(true);
  vi.mocked(recordStaffPayment).mockResolvedValue({} as never);
  show(false);
  fireEvent.click(await screen.findByRole('button', { name: 'Open Asad Khan' }));
  fireEvent.click(await screen.findByRole('button', { name: /Record payment/ }));
  const amount = screen.getByLabelText<HTMLInputElement>('Amount paid, PKR');
  expect(amount.value).toBe('20,000');
  fireEvent.change(amount, { target: { value: '25000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
  expect(await screen.findByText(/more than the .*20,000 still owed/)).toBeTruthy();
  expect(recordStaffPayment).not.toHaveBeenCalled();
  fireEvent.change(amount, { target: { value: '15000' } });
  fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'bank_transfer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
  await waitFor(() => expect(recordStaffPayment).toHaveBeenCalledTimes(1));
  const [, sentBranch, sentSalary, body, key] = vi.mocked(recordStaffPayment).mock.calls[0] ?? [];
  expect([sentBranch, sentSalary]).toEqual([branchId, salaryId]);
  expect(body).toMatchObject({ amountPaisa: 1_500_000, method: 'bank_transfer' });
  expect(typeof key).toBe('string');
});
it('CHG-039: a recorded payment is corrected by a reversal with a reason, never deleted', async () => {
  serve(true);
  vi.mocked(reverseStaffPayment).mockResolvedValue({} as never);
  show(false);
  fireEvent.click(await screen.findByRole('button', { name: 'Open Asad Khan' }));
  fireEvent.click(await screen.findByRole('button', { name: /Correct payment/ }));
  fireEvent.change(screen.getByLabelText('Why reverse it?'), { target: { value: 'Wrong amount' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reverse payment' }));
  await waitFor(() => expect(reverseStaffPayment).toHaveBeenCalledTimes(1));
  expect(vi.mocked(reverseStaffPayment).mock.calls[0]?.slice(1, 4)).toEqual([
    branchId,
    paymentId,
    { reason: 'Wrong amount' },
  ]);
});
it('CHG-039: editing clears a removed phone and custom title explicitly', () => {
  const body = staffBody(
    {
      fullName: 'Asad',
      phone: ' ',
      jobTitle: 'cook',
      customTitle: 'x',
      startsOn: '2026-01-10',
      salary: '',
      dueDay: '1',
    },
    member(false),
  );
  expect(body).toEqual({
    fullName: 'Asad',
    jobTitle: 'cook',
    startsOn: '2026-01-10',
    expectedVersion: 3,
    phone: null,
    customTitle: null,
  });
});
