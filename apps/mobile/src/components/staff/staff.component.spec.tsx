/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as sdk from '@hsm/api-client';
import { StaffWorkspace } from './staff-workspace';
import { StaffSetup } from './staff-setup';
import { OwnerManagerStaffAccess } from '../owner-manager-staff-access';
jest.mock('../../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-0000000000ff' }));
jest.mock('../private-file-picker', () => ({ PrivateFilePicker: () => null }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  listStaff: jest.fn(),
  readStaffDashboard: jest.fn(),
  readStaff: jest.fn(),
  recordStaffPayment: jest.fn(),
  createStaff: jest.fn(),
  setStaffSalaryTerms: jest.fn(),
  setStaffStatus: jest.fn(),
  readManagerInventoryGrants: jest.fn(),
  saveManagerInventoryGrants: jest.fn(),
}));
const branchId = '10000000-0000-4000-8000-000000000001';
const staffId = '10000000-0000-4000-8000-000000000002';
const salary = {
  id: '10000000-0000-4000-8000-000000000003',
  staffId,
  month: '2026-11-01',
  amountPaisa: 3000000,
  paidPaisa: 1000000,
  outstandingPaisa: 2000000,
  dueOn: '2026-11-05',
  timing: 'overdue' as const,
  partial: true,
};
const member = {
  id: staffId,
  branchId,
  fullName: 'Ali Cook',
  phone: null,
  jobTitle: 'cook' as const,
  customTitle: null,
  startsOn: '2026-01-01',
  endsOn: null,
  status: 'active' as const,
  version: 1,
  salary,
};
const payrollSummary = {
  paid: 0,
  unpaid: 0,
  due: 0,
  overdue: 1,
  partial: 1,
  needsAmount: 0,
  expectedPaisa: 3000000,
  paidPaisa: 1000000,
  outstandingPaisa: 2000000,
  recentPayments: [],
};
function show(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sdk.readStaffDashboard).mockResolvedValue({
    branchId,
    month: '2026-11-01',
    today: '2026-11-15',
    activeStaff: 1,
    payroll: payrollSummary,
  });
  jest.mocked(sdk.listStaff).mockResolvedValue({ data: [member], nextCursor: null, payroll: true });
  jest.mocked(sdk.readStaff).mockResolvedValue({
    staff: member,
    payroll: true,
    terms: [
      {
        id: salary.id,
        version: 1,
        amountPaisa: 3000000,
        dueDay: 5,
        effectiveFrom: '2026-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    salaries: [salary],
    payments: [],
    agreements: [],
  });
  jest.mocked(sdk.recordStaffPayment).mockResolvedValue({
    ...salary,
    paidPaisa: 3000000,
    outstandingPaisa: 0,
    timing: 'paid',
    partial: false,
  });
});
test('CHG-039: the Staff tool shows real counts, overdue and partly paid together, and records a payment', async () => {
  await show(<StaffWorkspace actorId="owner" branchId={branchId} />);
  expect(await screen.findByLabelText('Overdue: 1')).toBeTruthy();
  expect(screen.getAllByText('Overdue')).toHaveLength(2);
  expect(await screen.findByText('Partly paid')).toBeTruthy();
  // Staff are added and their details edited only in Hostel Setup; Operations runs payroll.
  expect(screen.queryByRole('button', { name: 'Add staff' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Ali Cook' }));
  await screen.findByRole('button', { name: /Record payment/ });
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  await fireEvent.press(await screen.findByRole('button', { name: /Record payment/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Bank transfer' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm payment' }));
  await waitFor(() =>
    expect(sdk.recordStaffPayment).toHaveBeenCalledWith(
      {},
      branchId,
      salary.id,
      expect.objectContaining({ amountPaisa: 2000000, method: 'bank_transfer' }),
      expect.any(String),
    ),
  );
});
test('CHG-039: without payroll access no money is shown', async () => {
  jest.mocked(sdk.readStaffDashboard).mockResolvedValue({
    branchId,
    month: '2026-11-01',
    today: '2026-11-15',
    activeStaff: 1,
    payroll: null,
  });
  jest
    .mocked(sdk.listStaff)
    .mockResolvedValue({ data: [{ ...member, salary: null }], nextCursor: null, payroll: false });
  await show(<StaffWorkspace actorId="manager" branchId={branchId} />);
  expect(await screen.findByText('Ali Cook')).toBeTruthy();
  expect(screen.queryByText(/PKR/)).toBeNull();
  expect(screen.queryByLabelText(/Overdue/)).toBeNull();
});
test('CHG-039: an Owner turns staff access on; salary access needs staff access first', async () => {
  jest.mocked(sdk.readManagerInventoryGrants).mockResolvedValue({
    branchId,
    assignmentId: staffId,
    permissions: ['booking_manage'],
  });
  jest.mocked(sdk.saveManagerInventoryGrants).mockResolvedValue({} as never);
  await show(
    <OwnerManagerStaffAccess
      actorId="owner"
      branchId={branchId}
      assignmentId={staffId}
      name="Sara"
    />,
  );
  const salaryAccess = await screen.findByRole('switch', { name: 'Salary access for Sara' });
  expect(salaryAccess.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
  await fireEvent.press(screen.getByRole('switch', { name: 'Staff access for Sara' }));
  await waitFor(() =>
    expect(sdk.saveManagerInventoryGrants).toHaveBeenCalledWith(
      {},
      branchId,
      staffId,
      { permissions: ['booking_manage', 'staff_manage'] },
      expect.any(String),
    ),
  );
});
it('CHG-039: hostel setup only adds staff and lists who was added', async () => {
  await show(<StaffSetup actorId="owner" branchId={branchId} />);
  expect(await screen.findByRole('button', { name: 'Edit Ali Cook' })).toBeTruthy();
  expect(screen.queryByText('Active staff')).toBeNull();
  expect(screen.queryByLabelText('Search staff')).toBeNull();
  expect(sdk.readStaffDashboard).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Add staff' }));
  expect(await screen.findByLabelText('Full name')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  // A name opens in the same form to fix mistakes.
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit Ali Cook' }));
  expect(screen.getByText('Edit staff')).toBeTruthy();
  expect(screen.getByLabelText('Full name').props.value).toBe('Ali Cook');
});
it('CHG-039: setup shows the real count and a complete Cook badge without a line clamp', async () => {
  await show(<StaffSetup actorId="owner" branchId={branchId} />);
  expect(await screen.findByText('1 staff added')).toBeTruthy();
  const role = screen.getByText('Cook');
  expect(role.props.numberOfLines).toBeUndefined();
  expect(role.props.ellipsizeMode).toBeUndefined();
  expect(screen.getByLabelText('Edit Ali Cook').props.accessibilityHint).toBe('Role: Cook');
});

it('CHG-039 / UI-001: Operations keeps salary history and payments without staff/salary edit controls', async () => {
  await show(<StaffWorkspace actorId="owner" branchId={branchId} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Open Ali Cook' }));
  await screen.findByRole('button', { name: /Record payment/ });
  expect(screen.queryByRole('button', { name: 'Change salary' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
});
it.each(['35000', '25000'])(
  'CHG-039: Edit Staff changes future salary to %s through the scoped versioned command',
  async (amount) => {
    jest.mocked(sdk.setStaffSalaryTerms).mockResolvedValue({} as never);
    await show(<StaffSetup actorId="owner" branchId={branchId} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Ali Cook' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit salary' }));
    expect(screen.getByLabelText('Monthly salary, PKR').props.value).toBe('30,000.00');
    await fireEvent.changeText(screen.getByLabelText('Monthly salary, PKR'), amount);
    await fireEvent.press(screen.getByRole('button', { name: 'Save salary' }));
    await waitFor(() =>
      expect(sdk.setStaffSalaryTerms).toHaveBeenCalledWith(
        {},
        branchId,
        staffId,
        expect.objectContaining({
          amountPaisa: Number(amount) * 100,
          dueDay: 5,
          effectiveFrom: expect.stringMatching(/^\d{4}-\d{2}-01$/),
        }),
        expect.any(String),
      ),
    );
    const submitted = jest.mocked(sdk.setStaffSalaryTerms).mock.calls[0]?.[3] as {
      effectiveFrom: string;
    };
    expect(submitted.effectiveFrom > salary.month).toBe(true);
    expect(sdk.recordStaffPayment).not.toHaveBeenCalled();
  },
);
it.each([
  ['Suspend staff', 'inactive'],
  ['Remove staff', 'ended'],
] as const)(
  'CHG-039: %s changes status and retains staff/payroll history',
  async (label, status) => {
    jest.mocked(sdk.setStaffStatus).mockResolvedValue({ ...member, status });
    await show(<StaffSetup actorId="owner" branchId={branchId} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit Ali Cook' }));
    await fireEvent.press(await screen.findByRole('button', { name: label }));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Employment change');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm ' + label.toLowerCase() }));
    await waitFor(() =>
      expect(sdk.setStaffStatus).toHaveBeenCalledWith(
        {},
        branchId,
        staffId,
        expect.objectContaining({
          expectedVersion: 1,
          status,
          reason: 'Employment change',
          ...(status === 'ended' ? { endsOn: expect.any(String) } : {}),
        }),
        expect.any(String),
      ),
    );
    expect(sdk.listStaff).toHaveBeenCalledWith({}, branchId, { limit: 50 });
  },
);

it('CHG-039: Add Staff saves its initial salary with the staff record', async () => {
  jest.mocked(sdk.createStaff).mockResolvedValue(member);
  await show(<StaffSetup actorId="owner" branchId={branchId} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Add staff' }));
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'New Cook');
  await fireEvent.press(screen.getByRole('button', { name: 'Cook' }));
  await fireEvent.changeText(screen.getByLabelText('Monthly salary, PKR (optional)'), '30000');
  await fireEvent.changeText(screen.getByLabelText('Pay day'), '5');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(sdk.createStaff).toHaveBeenCalledWith(
      {},
      branchId,
      expect.objectContaining({
        fullName: 'New Cook',
        salary: expect.objectContaining({ amountPaisa: 3000000, dueDay: 5 }),
      }),
      expect.any(String),
    ),
  );
  expect(sdk.setStaffSalaryTerms).not.toHaveBeenCalled();
});
it('CHG-039: suspended staff remain reachable in setup and can be reactivated', async () => {
  jest.mocked(sdk.listStaff).mockResolvedValue({
    data: [{ ...member, status: 'inactive' }],
    nextCursor: null,
    payroll: true,
  });
  const detail = await sdk.readStaff({} as never, branchId, staffId);
  jest
    .mocked(sdk.readStaff)
    .mockResolvedValue({ ...detail, staff: { ...member, status: 'inactive' } });
  jest.mocked(sdk.setStaffStatus).mockResolvedValue(member);
  await show(<StaffSetup actorId="owner" branchId={branchId} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit Ali Cook' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Reactivate staff' }));
  await fireEvent.changeText(screen.getByLabelText('Reason'), 'Returned to work');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm reactivate staff' }));
  await waitFor(() =>
    expect(sdk.setStaffStatus).toHaveBeenCalledWith(
      {},
      branchId,
      staffId,
      { expectedVersion: 1, status: 'active', reason: 'Returned to work' },
      expect.any(String),
    ),
  );
});
it('CHG-039 / SEC-003: the live detail payroll grant controls salary editing in setup', async () => {
  const detail = await sdk.readStaff({} as never, branchId, staffId);
  jest
    .mocked(sdk.readStaff)
    .mockResolvedValue({ ...detail, payroll: false, terms: [], salaries: [], payments: [] });
  await show(<StaffSetup actorId="owner" branchId={branchId} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit Ali Cook' }));
  await screen.findByRole('button', { name: 'Suspend staff' });
  expect(screen.queryByRole('button', { name: 'Edit salary' })).toBeNull();
  expect(screen.queryByText('Monthly salary')).toBeNull();
});

it('OWN-004: salary shortcut reuses payroll with a server filter across every staff status', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <StaffWorkspace actorId="u" branchId={branchId} initialDue />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(sdk.listStaff).toHaveBeenCalledWith(
      expect.anything(),
      branchId,
      expect.objectContaining({ salary: 'due' }),
    ),
  );
  const input = jest.mocked(sdk.listStaff).mock.calls.at(-1)?.[2];
  expect(input).not.toHaveProperty('status');
});
