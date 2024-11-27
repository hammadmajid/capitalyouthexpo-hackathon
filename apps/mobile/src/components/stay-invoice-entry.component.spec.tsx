jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  readInventoryAccess,
  readStaffStays,
  readStaffStay,
  readCustomerStays,
  readCustomerStay,
  readCustomerStayInvoices,
  readCustomerStayInvoice,
  readStaffStayInvoices,
  readStaffStayInvoice,
} from '@hsm/api-client';
import { StayDirectory } from './stay-directory';
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readInventoryAccess: jest.fn(),
  readStaffStays: jest.fn(),
  readStaffStay: jest.fn(),
  readCustomerStays: jest.fn(),
  readCustomerStay: jest.fn(),
  readCustomerStayInvoices: jest.fn(),
  readCustomerStayInvoice: jest.fn(),
  readStaffStayInvoices: jest.fn(),
  readStaffStayInvoice: jest.fn(),
}));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
const id = '10000000-0000-4000-8000-000000000001',
  invoice = '10000000-0000-4000-8000-000000000002';
const stay: Awaited<ReturnType<typeof readCustomerStay>> = {
  id,
  branchId: id,
  residentId: id,
  displayName: 'Selected resident',
  source: 'manual',
  state: 'check_in_ready',
  version: 1,
  moveInDate: '2028-02-01',
  expectedLeaveDate: null,
  checkedInAt: null,
  closedAt: null,
  currentAssignment: null,
  bookingId: null,
  contact: { phone: null, email: null },
};
let cache: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  for (const read of [
    readInventoryAccess,
    readStaffStays,
    readStaffStay,
    readCustomerStays,
    readCustomerStay,
    readCustomerStayInvoices,
    readCustomerStayInvoice,
    readStaffStayInvoices,
    readStaffStayInvoice,
  ])
    jest.mocked(read).mockReset();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: ['stay_manage', 'finance_view'],
    canConfigureManagers: false,
  });
  jest.mocked(readCustomerStays).mockResolvedValue({ data: [stay], nextCursor: null });
  jest.mocked(readStaffStays).mockResolvedValue({ data: [stay], nextCursor: null });
  jest.mocked(readCustomerStay).mockResolvedValue(stay);
  jest.mocked(readStaffStay).mockResolvedValue(stay);
  const page = {
    branchId: id,
    stayId: id,
    data: [
      {
        invoiceId: invoice,
        invoiceNumber: 'INV-current',
        dueDate: '2028-03-01',
        issuedAt: '2028-02-01T06:00:00.000Z',
        documentState: 'issued' as const,
      },
    ],
    nextCursor: null,
  };
  const balance = {
    invoiceId: invoice,
    invoiceNumber: 'INV-current',
    currency: 'PKR' as const,
    dueDate: '2028-03-01',
    graceDays: 2,
    totalPaisa: 1001,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    allocatedPaisa: 0,
    outstandingPaisa: 1001,
    state: 'issued' as const,
  };
  jest.mocked(readCustomerStayInvoices).mockResolvedValue(page);
  jest.mocked(readStaffStayInvoices).mockResolvedValue(page);
  jest.mocked(readCustomerStayInvoice).mockResolvedValue(balance);
  jest.mocked(readStaffStayInvoice).mockResolvedValue(balance);
});
afterEach(() => cache.clear());
async function open(staff = false) {
  await render(
    <QueryClientProvider client={cache}>
      <StayDirectory actorId={id} {...(staff ? { branchId: id } : {})} />
    </QueryClientProvider>,
  );
  await fireEvent.press(
    await screen.findByRole('button', { name: staff ? 'Residents and stays' : 'My stays' }),
  );
  await fireEvent.press(
    await screen.findByRole('button', { name: 'View stay for Selected resident' }),
  );
  await screen.findByRole('button', {
    name: staff ? 'Back to residents' : 'Back from stay details',
  });
}
test('RES-001 / FIN-001: actual own Stay entry selects a named invoice and loads its exact protected balance', async () => {
  await open();
  // Bills list straight away; the protected balance still loads only when one is chosen.
  expect(readCustomerStayInvoice).not.toHaveBeenCalled();
  await fireEvent.press(await screen.findByRole('button', { name: 'View invoice INV-current' }));
  await screen.findByText(/^Bill PKR 10\.01/);
  expect(readCustomerStayInvoices).toHaveBeenCalledWith({}, id, { limit: 20 });
  expect(readCustomerStayInvoice).toHaveBeenCalledWith({}, id, invoice);
  expect(screen.queryByText(invoice)).toBeNull();
});
test('SEC-003 / FIN-001: actual named staff Stay reuses its parent grant without an authority-observer loop', async () => {
  await open(true);
  await fireEvent.press(screen.getByRole('button', { name: 'View payments' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'View invoice INV-current' }));
  await screen.findByText('Due PKR 10.01');
  expect(readStaffStayInvoices).toHaveBeenCalledWith({}, id, id, { limit: 20 });
  expect(readStaffStayInvoice).toHaveBeenCalledWith({}, id, id, invoice);
  expect(readInventoryAccess).toHaveBeenCalledTimes(1);
});
test('SEC-003: operational Stay access alone never exposes the actual financial entry point', async () => {
  jest
    .mocked(readInventoryAccess)
    .mockResolvedValue({ branchId: id, permissions: ['stay_manage'], canConfigureManagers: false });
  await open(true);
  expect(screen.queryByRole('button', { name: 'View invoice INV-current' })).toBeNull();
  expect(readStaffStayInvoices).not.toHaveBeenCalled();
  expect(readStaffStayInvoice).not.toHaveBeenCalled();
});
