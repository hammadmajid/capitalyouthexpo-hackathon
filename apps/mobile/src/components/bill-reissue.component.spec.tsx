/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { readInventoryAccess, reissueStayInvoice } from '@hsm/api-client';
import type { ResidentInvoiceBalance } from '@hsm/contracts';
import { BillReissue } from './bill-reissue';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000009' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readInventoryAccess: jest.fn(),
  reissueStayInvoice: jest.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001',
  invoice = '10000000-0000-4000-8000-000000000002';
const unpaid: ResidentInvoiceBalance = {
  invoiceId: invoice,
  invoiceNumber: 'INV-1',
  currency: 'PKR',
  dueDate: '2026-11-01',
  graceDays: 0,
  totalPaisa: 1001,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
  outstandingPaisa: 1001,
  state: 'overdue',
};
function access(owner: boolean) {
  jest.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: ['finance_view', 'payment_record'],
    canConfigureManagers: owner,
  } as Awaited<ReturnType<typeof readInventoryAccess>>);
}
async function show(balance = unpaid) {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <BillReissue actorId={id} branchId={id} stayId={id} balance={balance} />
    </QueryClientProvider>,
  );
}
beforeEach(() => jest.clearAllMocks());
test('CHG-053: the Owner moves an unpaid bill to a new due date with a reason', async () => {
  access(true);
  jest.mocked(reissueStayInvoice).mockResolvedValue({ voidedInvoiceId: invoice, invoiceId: id });
  await show();
  await fireEvent.press(await screen.findByRole('button', { name: 'Change due date' }));
  await fireEvent.press(screen.getByRole('button', { name: 'New due date: 1 Nov 2026' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Day 17' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Set date' }));
  await fireEvent.changeText(screen.getByLabelText('Why'), 'Due before move-in');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel bill & reissue' }));
  await waitFor(() => expect(reissueStayInvoice).toHaveBeenCalled());
  expect(reissueStayInvoice).toHaveBeenCalledWith(
    {},
    id,
    id,
    invoice,
    { dueDate: '2026-11-17', reason: 'Due before move-in' },
    '10000000-0000-4000-8000-000000000009',
  );
});
test('CHG-053: a Manager, or a bill with any payment, shows no cancel action', async () => {
  access(false);
  await show();
  await screen.findByRole('button', { name: 'Change due date' }).catch(() => null);
  expect(screen.queryByRole('button', { name: 'Change due date' })).toBeNull();
  access(true);
  await show({ ...unpaid, allocatedPaisa: 1, outstandingPaisa: 1000, state: 'partially_paid' });
  await screen.findByRole('button', { name: 'Change due date' }).catch(() => null);
  expect(screen.queryByRole('button', { name: 'Change due date' })).toBeNull();
});
