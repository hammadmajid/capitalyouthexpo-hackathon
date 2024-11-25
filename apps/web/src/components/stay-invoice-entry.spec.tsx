import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryAccess: vi.fn(),
  readStaffStays: vi.fn(),
  readStaffStay: vi.fn(),
  readCustomerStays: vi.fn(),
  readCustomerStay: vi.fn(),
  readCustomerStayInvoices: vi.fn(),
  readCustomerStayInvoice: vi.fn(),
  readStaffStayInvoices: vi.fn(),
  readStaffStayInvoice: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
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
  vi.resetAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: ['stay_manage', 'finance_view'],
    canConfigureManagers: false,
  });
  vi.mocked(readCustomerStays).mockResolvedValue({ data: [stay], nextCursor: null });
  vi.mocked(readStaffStays).mockResolvedValue({ data: [stay], nextCursor: null });
  vi.mocked(readCustomerStay).mockResolvedValue(stay);
  vi.mocked(readStaffStay).mockResolvedValue(stay);
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
  vi.mocked(readCustomerStayInvoices).mockResolvedValue(page);
  vi.mocked(readStaffStayInvoices).mockResolvedValue(page);
  vi.mocked(readCustomerStayInvoice).mockResolvedValue(balance);
  vi.mocked(readStaffStayInvoice).mockResolvedValue(balance);
});
afterEach(() => {
  cleanup();
  cache.clear();
});
async function open(staff = false) {
  render(
    <QueryClientProvider client={cache}>
      <StayDirectory actorId={id} {...(staff ? { branchId: id } : {})} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText(staff ? 'Residents and stays' : 'My stays'));
  fireEvent.click(await screen.findByText('View stay for Selected resident'));
  await screen.findByText('Phone: Not provided');
}
it('RES-001 / FIN-001: actual own Stay entry selects a named invoice and loads its exact protected balance', async () => {
  await open();
  expect(readCustomerStayInvoices).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('View invoices'));
  fireEvent.click(await screen.findByText('View invoice INV-current'));
  await screen.findByText('Original total: PKR 10.01');
  expect(readCustomerStayInvoices).toHaveBeenCalledWith({}, id, { limit: 20 });
  expect(readCustomerStayInvoice).toHaveBeenCalledWith({}, id, invoice);
  expect(screen.queryByText(invoice)).toBeNull();
});
it('SEC-003 / FIN-001: actual named staff Stay reuses its parent grant without an authority-observer loop', async () => {
  await open(true);
  fireEvent.click(screen.getByText('View invoices'));
  fireEvent.click(await screen.findByText('View invoice INV-current'));
  await screen.findByText('Outstanding: PKR 10.01');
  expect(readStaffStayInvoices).toHaveBeenCalledWith({}, id, id, { limit: 20 });
  expect(readStaffStayInvoice).toHaveBeenCalledWith({}, id, id, invoice);
  expect(readInventoryAccess).toHaveBeenCalledTimes(1);
});
it('SEC-003: operational Stay access alone never exposes the actual financial entry point', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: ['stay_manage'],
    canConfigureManagers: false,
  });
  await open(true);
  expect(screen.queryByText('View invoices')).toBeNull();
  expect(readStaffStayInvoices).not.toHaveBeenCalled();
  expect(readStaffStayInvoice).not.toHaveBeenCalled();
});
