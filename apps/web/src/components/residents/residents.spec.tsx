import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  listOwnerManagers,
  readBedHistory,
  readInventoryAccess,
  readStaffStayRecord,
  readStayResidentPhoto,
  reissueStayInvoice,
  removeOwnerManager,
  updateResidentContact,
} from '@hsm/api-client';
import type { ResidentInvoiceBalance } from '@hsm/contracts';
import { BedHistory } from './bed-history';
import { BillReissue, canReissue } from './bill-reissue';
import { OwnerManagerRemove } from './owner-manager-remove';
import { ResidentEdit, toE164 } from './resident-edit';
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  updateResidentContact: vi.fn(),
  readInventoryAccess: vi.fn(),
  reissueStayInvoice: vi.fn(),
  readBedHistory: vi.fn(),
  readStaffStayRecord: vi.fn(),
  readStayResidentPhoto: vi.fn(),
  listOwnerManagers: vi.fn(),
  removeOwnerManager: vi.fn(),
  readAgreementFiles: vi.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  stayId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  residentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  invoiceId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  managerId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
function wrap(node: React.ReactNode) {
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('RES-006: staff correct an offline resident in the +92 form the server requires', async () => {
  expect(toE164('0300 1234567')).toBe('+923001234567');
  vi.mocked(updateResidentContact).mockResolvedValue({} as never);
  const close = vi.fn();
  const user = userEvent.setup();
  wrap(
    <ResidentEdit
      actorId="staff"
      branchId={branchId}
      residentId={residentId}
      name="Ali"
      phone={null}
      email={null}
      close={close}
    />,
  );
  await user.clear(screen.getByLabelText('Resident name'));
  await user.type(screen.getByLabelText('Resident name'), 'Ali Khan');
  await user.type(screen.getByLabelText('Resident phone'), '12');
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save resident' }).disabled).toBe(
    true,
  );
  await user.clear(screen.getByLabelText('Resident phone'));
  await user.type(screen.getByLabelText('Resident phone'), '03001234567');
  await user.click(screen.getByRole('button', { name: 'Save resident' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(updateResidentContact).toHaveBeenCalledWith({}, branchId, residentId, {
    displayName: 'Ali Khan',
    phone: '+923001234567',
    email: null,
  });
});
function balance(change: Partial<ResidentInvoiceBalance> = {}) {
  return {
    invoiceId,
    invoiceNumber: 'INV-1',
    state: 'issued',
    dueDate: '2026-12-05',
    graceDays: 3,
    totalPaisa: 1000000,
    allocatedPaisa: 0,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    outstandingPaisa: 1000000,
    ...change,
  } as ResidentInvoiceBalance;
}
it('CHG-053: only a wholly unpaid open bill can be reissued, by the Owner only', async () => {
  expect(canReissue(balance({ allocatedPaisa: 100 }))).toBe(false);
  expect(canReissue(balance({ state: 'paid' }))).toBe(false);
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: ['finance_view'],
    canConfigureManagers: false,
  });
  wrap(<BillReissue actorId="manager" branchId={branchId} stayId={stayId} balance={balance()} />);
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Change due date' })).toBeNull();
});
it('CHG-053: the Owner cancels and reissues a bill with a reason and a new due date', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId,
    permissions: [],
    canConfigureManagers: true,
  });
  vi.mocked(reissueStayInvoice).mockResolvedValue({ voidedInvoiceId: invoiceId, invoiceId });
  const user = userEvent.setup();
  wrap(<BillReissue actorId="owner" branchId={branchId} stayId={stayId} balance={balance()} />);
  await user.click(await screen.findByRole('button', { name: 'Change due date' }));
  const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel bill & reissue' });
  await user.type(screen.getByLabelText('Why'), 'Salary date moved');
  expect(save.disabled).toBe(true);
  await user.clear(screen.getByLabelText('New due date'));
  await user.type(screen.getByLabelText('New due date'), '2026-12-10');
  await user.click(save);
  await waitFor(() => expect(reissueStayInvoice).toHaveBeenCalledTimes(1));
  const [, sentBranch, sentStay, sentInvoice, body, key] =
    vi.mocked(reissueStayInvoice).mock.calls[0] ?? [];
  expect([sentBranch, sentStay, sentInvoice]).toEqual([branchId, stayId, invoiceId]);
  expect(body).toEqual({ dueDate: '2026-12-10', reason: 'Salary date moved' });
  expect(typeof key).toBe('string');
});
it('RES-005: bed history lists past and current stays and opens the original Stay', async () => {
  vi.mocked(readBedHistory).mockResolvedValue({
    branchId,
    bedId: residentId,
    nextCursor: null,
    data: [
      {
        assignmentId: invoiceId,
        stayId,
        residentName: 'Sara',
        wholeRoom: false,
        startedAt: '2026-10-01T05:00:00.000Z',
        endedAt: null,
      },
      {
        assignmentId: managerId,
        stayId: residentId,
        residentName: 'Hina',
        wholeRoom: true,
        startedAt: '2026-08-01T05:00:00.000Z',
        endedAt: '2026-09-30T05:00:00.000Z',
      },
    ],
  } as never);
  vi.mocked(readStaffStayRecord).mockRejectedValue(new Error('not needed'));
  vi.mocked(readStayResidentPhoto).mockResolvedValue({ url: null, expiresAt: null });
  const user = userEvent.setup();
  wrap(<BedHistory actorId="staff" branchId={branchId} bedId={residentId} />);
  expect(await screen.findByRole('button', { name: /^Now · Sara/ })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /^Hina · Whole room · in .* left / }));
  await waitFor(() => expect(readStaffStayRecord).toHaveBeenCalledWith({}, branchId, residentId));
});
it('AUTH-M-006: the Owner removes a Manager only after confirming their own password', async () => {
  vi.mocked(listOwnerManagers).mockResolvedValue({
    data: [
      { id: managerId, branchId, fullName: 'Bilal', status: 'active' },
      { id: stayId, branchId, fullName: 'Old', status: 'deactivated' },
    ],
    nextCursor: null,
  } as never);
  vi.mocked(removeOwnerManager).mockResolvedValue({} as never);
  const user = userEvent.setup();
  wrap(<OwnerManagerRemove userId="owner" branchId={branchId} />);
  await user.click(screen.getByRole('button', { name: 'Remove a Manager' }));
  expect(screen.queryByRole('button', { name: 'Old' })).toBeNull();
  await user.click(await screen.findByRole('button', { name: 'Bilal' }));
  expect(screen.getByText(/Their access ends now and cannot be undone/)).toBeTruthy();
  await user.type(screen.getByLabelText('Your password'), 'owner-password');
  await user.click(screen.getByRole('button', { name: 'Yes, remove Manager' }));
  await waitFor(() =>
    expect(removeOwnerManager).toHaveBeenCalledWith({}, branchId, managerId, 'owner-password'),
  );
  expect(await screen.findByText('Bilal removed.')).toBeTruthy();
});
it('STAY-002: after a walk-in admission the signed agreement is attached to the new Stay', async () => {
  const { AdmissionRecorded } = await import('../admission-submission-state');
  const { readAgreementFiles } = await import('@hsm/api-client');
  vi.mocked(readAgreementFiles).mockResolvedValue({ data: [], nextCursor: null } as never);
  wrap(
    <AdmissionRecorded
      labels={{ branchLabel: 'Branch A', residentLabel: 'Sara', targetLabel: 'Bed 1' }}
      allowed
      refreshFailed={false}
      onDone={() => undefined}
      actorId="staff"
      admitted={{ branchId, stayId, agreementId: invoiceId }}
    />,
  );
  expect(await screen.findByText('No agreement scans yet.')).toBeTruthy();
  expect(readAgreementFiles).toHaveBeenCalledWith(
    {},
    { branchId, stayId, agreementId: invoiceId },
    { limit: 20 },
  );
});
