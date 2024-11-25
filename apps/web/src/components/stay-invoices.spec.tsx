import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  readCustomerStayInvoices,
  readCustomerStayInvoice,
  readStaffStayInvoices,
  readStaffStayInvoice,
} from '@hsm/api-client';
import type { ResidentInvoiceBalance, StayInvoiceReferencePage } from '@hsm/contracts';
import { StayInvoices } from './stay-invoices';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readCustomerStayInvoices: vi.fn(),
  readCustomerStayInvoice: vi.fn(),
  readStaffStayInvoices: vi.fn(),
  readStaffStayInvoice: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
const id = '10000000-0000-4000-8000-000000000001',
  invoice = '10000000-0000-4000-8000-000000000002',
  next = '10000000-0000-4000-8000-000000000099';
const page: StayInvoiceReferencePage = {
  branchId: id,
  stayId: id,
  nextCursor: null,
  data: [
    {
      invoiceId: invoice,
      invoiceNumber: 'INV-1',
      dueDate: '2028-03-01',
      issuedAt: '2028-02-01T06:00:00.000Z',
      documentState: 'issued',
    },
  ],
};
const balance: ResidentInvoiceBalance = {
  invoiceId: invoice,
  invoiceNumber: 'INV-1',
  currency: 'PKR',
  dueDate: '2028-03-01',
  graceDays: 2,
  totalPaisa: 1001,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 201,
  outstandingPaisa: 800,
  state: 'partially_paid',
};
let cache: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(readCustomerStayInvoices).mockResolvedValue(page);
  vi.mocked(readStaffStayInvoices).mockResolvedValue(page);
  vi.mocked(readCustomerStayInvoice).mockResolvedValue(balance);
  vi.mocked(readStaffStayInvoice).mockResolvedValue(balance);
});
afterEach(() => {
  cleanup();
  cache.clear();
});
function fixture(options: { branchId?: string; canView?: boolean } = {}) {
  const props = {
    actorId: id,
    stayId: id,
    canView: options.canView ?? true,
    ...(options.branchId ? { branchId: options.branchId } : {}),
  };
  const tree = (value = props) => (
    <QueryClientProvider client={cache}>
      <StayInvoices {...value} />
    </QueryClientProvider>
  );
  return { ...render(tree()), props, tree };
}
async function open() {
  fireEvent.click(screen.getByText('View invoices'));
  await screen.findByText('View invoice INV-1');
}
it.each([false, true])(
  'FIN-001 / SEC-003: actual %s scoped reads are lazy and display exact authoritative receipt-backed amounts',
  async (staff) => {
    fixture(staff ? { branchId: id } : {});
    expect(readCustomerStayInvoices).not.toHaveBeenCalled();
    expect(readStaffStayInvoices).not.toHaveBeenCalled();
    await open();
    expect(readCustomerStayInvoice).not.toHaveBeenCalled();
    expect(readStaffStayInvoice).not.toHaveBeenCalled();
    expect(screen.queryByText('Paid')).toBeNull();
    fireEvent.click(screen.getByText('View invoice INV-1'));
    await screen.findByText('Original total: PKR 10.01');
    expect(screen.getByText('Receipt-backed allocations: PKR 2.01')).toBeDefined();
    expect(screen.getByText('Outstanding: PKR 8.00')).toBeDefined();
    expect(screen.getByText('Financial status: Partially paid')).toBeDefined();
    expect(screen.queryByText(invoice)).toBeNull();
    if (staff) {
      expect(readStaffStayInvoices).toHaveBeenCalledWith({}, id, id, { limit: 20 });
      expect(readStaffStayInvoice).toHaveBeenCalledWith({}, id, id, invoice);
    } else {
      expect(readCustomerStayInvoices).toHaveBeenCalledWith({}, id, { limit: 20 });
      expect(readCustomerStayInvoice).toHaveBeenCalledWith({}, id, invoice);
    }
    fireEvent.click(screen.getByText('Close invoice balance'));
    expect(screen.queryByLabelText('Current invoice balance')).toBeNull();
    fireEvent.click(screen.getByText('Close invoices'));
    expect(screen.queryByText('View invoice INV-1')).toBeNull();
  },
);
it('SEC-003: absent current finance access never requests or exposes private invoices', () => {
  fixture({ branchId: id, canView: false });
  expect(screen.queryByText('View invoices')).toBeNull();
  expect(readStaffStayInvoices).not.toHaveBeenCalled();
  expect(readStaffStayInvoice).not.toHaveBeenCalled();
});
it('ACC-004: a failed list is not an empty financial history; retry uses a genuine empty success', async () => {
  vi.mocked(readCustomerStayInvoices).mockRejectedValueOnce(Error('Private network detail'));
  fixture();
  fireEvent.click(screen.getByText('View invoices'));
  await screen.findByRole('alert');
  expect(screen.queryByText('No invoices are available for this Stay.')).toBeNull();
  expect(screen.queryByText(/Private network detail/)).toBeNull();
  vi.mocked(readCustomerStayInvoices).mockResolvedValue({ ...page, data: [] });
  fireEvent.click(screen.getByText('Retry invoices'));
  await screen.findByText('No invoices are available for this Stay.');
});
it('FIN-001 / ACC-004: real continuation controls clear the previous selected balance and keep page boundaries', async () => {
  const reference = page.data[0];
  if (!reference) throw Error('Reference fixture missing');
  const rows = Array.from({ length: 20 }, (_, index) => ({
    ...reference,
    invoiceId: '10000000-0000-4000-8000-' + String(index + 2).padStart(12, '0'),
    invoiceNumber: 'INV-' + String(index + 1),
  }));
  const cursor = rows.at(-1)?.invoiceId;
  if (!cursor) throw Error('Fixture cursor missing');
  vi.mocked(readCustomerStayInvoices)
    .mockResolvedValueOnce({ ...page, data: rows, nextCursor: cursor })
    .mockResolvedValueOnce({
      ...page,
      data: [{ ...reference, invoiceId: next, invoiceNumber: 'INV-21', documentState: 'voided' }],
    });
  fixture();
  await open();
  fireEvent.click(screen.getByText('View invoice INV-1'));
  await screen.findByText('Outstanding: PKR 8.00');
  fireEvent.click(screen.getByText('Next invoices'));
  await screen.findByText('View invoice INV-21');
  expect(readCustomerStayInvoices).toHaveBeenLastCalledWith({}, id, { limit: 20, cursor });
  expect(screen.queryByLabelText('Current invoice balance')).toBeNull();
  expect(screen.getByText(/Voided document/)).toBeDefined();
  fireEvent.click(screen.getByText('First invoices'));
  await screen.findByText('View invoice INV-1');
  expect(readCustomerStayInvoices).toHaveBeenLastCalledWith({}, id, { limit: 20 });
});
it('SEC-003: failed revalidation hides cached references and financial facts until current access succeeds', async () => {
  fixture();
  await open();
  fireEvent.click(screen.getByText('View invoice INV-1'));
  await screen.findByText('Outstanding: PKR 8.00');
  vi.mocked(readCustomerStayInvoices).mockRejectedValue(Error('Private denial'));
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['private-invoices', id, 'own', id] });
  });
  await screen.findByRole('alert');
  expect(screen.queryByText('View invoice INV-1')).toBeNull();
  expect(screen.queryByText('Outstanding: PKR 8.00')).toBeNull();
  vi.mocked(readCustomerStayInvoices).mockResolvedValue(page);
  fireEvent.click(screen.getByText('Retry invoices'));
  await screen.findByText('View invoice INV-1');
  expect(screen.queryByLabelText('Current invoice balance')).toBeNull();
});
it('SEC-003: denied selected balance hides references and safe retry discards the denied selection', async () => {
  vi.mocked(readCustomerStayInvoice).mockRejectedValue(Error('Private invoice explanation'));
  fixture();
  await open();
  fireEvent.click(screen.getByText('View invoice INV-1'));
  await screen.findByRole('alert');
  expect(screen.queryByText('View invoice INV-1')).toBeNull();
  expect(screen.queryByText(/Private invoice explanation/)).toBeNull();
  fireEvent.click(screen.getByText('Retry invoices'));
  await screen.findByText('View invoice INV-1');
  expect(screen.queryByLabelText('Current invoice balance')).toBeNull();
});
it('SEC-003: actor and Stay scope changes reset open financial history; live access loss hides existing facts', async () => {
  const f = fixture();
  await open();
  fireEvent.click(screen.getByText('View invoice INV-1'));
  await screen.findByText('Outstanding: PKR 8.00');
  f.rerender(f.tree({ ...f.props, canView: false }));
  expect(screen.queryByText('Outstanding: PKR 8.00')).toBeNull();
  f.rerender(f.tree({ ...f.props, actorId: next, stayId: next }));
  await screen.findByText('View invoices');
  expect(screen.queryByText('View invoice INV-1')).toBeNull();
  await waitFor(() => expect(readCustomerStayInvoices).toHaveBeenCalledTimes(1));
});
