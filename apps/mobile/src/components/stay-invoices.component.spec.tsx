/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  readCustomerStayInvoices,
  readCustomerStayInvoice,
  readStaffStayInvoices,
  readStaffStayInvoice,
} from '@hsm/api-client';
import type { ResidentInvoiceBalance, StayInvoiceReferencePage } from '@hsm/contracts';
import { StayInvoices } from './stay-invoices';
import { pullToRefresh } from '../test-utils/pull-refresh';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readCustomerStayInvoices: jest.fn(),
  readCustomerStayInvoice: jest.fn(),
  readStaffStayInvoices: jest.fn(),
  readStaffStayInvoice: jest.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001',
  invoice = '10000000-0000-4000-8000-000000000002',
  next = '10000000-0000-4000-8000-000000000099';
const reference: StayInvoiceReferencePage['data'][number] = {
  invoiceId: invoice,
  invoiceNumber: 'INV-1',
  dueDate: '2028-03-01',
  issuedAt: '2028-02-01T06:00:00.000Z',
  documentState: 'issued',
};
const page: StayInvoiceReferencePage = {
  branchId: id,
  stayId: id,
  nextCursor: null,
  data: [reference],
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
  jest.clearAllMocks();
  for (const read of [
    readCustomerStayInvoices,
    readCustomerStayInvoice,
    readStaffStayInvoices,
    readStaffStayInvoice,
  ])
    jest.mocked(read).mockReset();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(readCustomerStayInvoices).mockResolvedValue(page);
  jest.mocked(readStaffStayInvoices).mockResolvedValue(page);
  jest.mocked(readCustomerStayInvoice).mockResolvedValue(balance);
  jest.mocked(readStaffStayInvoice).mockResolvedValue(balance);
});
afterEach(() => cache.clear());
async function fixture(options: { branchId?: string; canView?: boolean } = {}) {
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
  return { ...(await render(tree())), props, tree };
}
// Bills show straight away; there is no "View invoices" step any more.
async function open() {
  await screen.findByRole('button', { name: 'View invoice INV-1' });
}
test.each([false, true])(
  'FIN-001 / SEC-003: native staff=%s balance reads are lazy, exact and retain every paisa',
  async (staff) => {
    await fixture(staff ? { branchId: id } : {});
    await open();
    expect(readCustomerStayInvoice).not.toHaveBeenCalled();
    expect(readStaffStayInvoice).not.toHaveBeenCalled();
    expect(screen.queryByText('Paid')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'View invoice INV-1' }));
    await screen.findByText(/^Bill PKR 10\.01 · Paid PKR 2\.01/);
    expect(screen.getByText('Due PKR 8')).toBeDefined();
    expect(screen.getByText('Part paid')).toBeDefined();
    expect(screen.queryByText(invoice)).toBeNull();
    expect(screen.queryByText('INV-1')).toBeNull();
    if (staff) {
      expect(readStaffStayInvoices).toHaveBeenCalledWith({}, id, id, { limit: 20 });
      expect(readStaffStayInvoice).toHaveBeenCalledWith({}, id, id, invoice);
    } else {
      expect(readCustomerStayInvoices).toHaveBeenCalledWith({}, id, { limit: 20 });
      expect(readCustomerStayInvoice).toHaveBeenCalledWith({}, id, invoice);
    }
    // Tapping the same bill again folds it; each bill is shown only once.
    await fireEvent.press(screen.getByRole('button', { name: 'View invoice INV-1' }));
    expect(screen.queryByLabelText('Current invoice balance')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'View invoice INV-1' })).toHaveLength(1);
  },
);
test('SEC-003: native missing current finance grant does not request or expose invoices', async () => {
  await fixture({ branchId: id, canView: false });
  expect(screen.queryByRole('button', { name: 'View invoices' })).toBeNull();
  expect(readStaffStayInvoices).not.toHaveBeenCalled();
  expect(readStaffStayInvoice).not.toHaveBeenCalled();
});
test('ACC-004: native failed list is distinct from genuinely empty history and has safe retry', async () => {
  jest.mocked(readCustomerStayInvoices).mockRejectedValueOnce(Error('Private failure detail'));
  await fixture();
  await screen.findByRole('alert');
  expect(screen.queryByText('No bills yet')).toBeNull();
  expect(screen.queryByText(/Private failure detail/)).toBeNull();
  jest.mocked(readCustomerStayInvoices).mockResolvedValue({ ...page, data: [] });
  await pullToRefresh(cache);
  await screen.findByText('No bills yet');
});
test('FIN-001 / ACC-004: native genuine twenty-row continuation resets detail and selects actual later references', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    ...reference,
    invoiceId: '10000000-0000-4000-8000-' + String(index + 2).padStart(12, '0'),
    invoiceNumber: 'INV-' + String(index + 1),
  }));
  const cursor = rows.at(-1)?.invoiceId;
  if (!cursor) throw Error('Fixture cursor missing');
  jest
    .mocked(readCustomerStayInvoices)
    .mockResolvedValueOnce({ ...page, data: rows, nextCursor: cursor })
    .mockResolvedValueOnce({
      ...page,
      data: [{ ...reference, invoiceId: next, invoiceNumber: 'INV-21', documentState: 'voided' }],
    });
  await fixture();
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'View invoice INV-1' }));
  await screen.findByText('Due PKR 8');
  await fireEvent.press(screen.getByRole('button', { name: 'Next invoices' }));
  await screen.findByRole('button', { name: 'View invoice INV-21' });
  expect(readCustomerStayInvoices).toHaveBeenLastCalledWith({}, id, { limit: 20, cursor });
  expect(screen.queryByLabelText('Current invoice balance')).toBeNull();
  expect(screen.getByText('Voided')).toBeDefined();
  await fireEvent.press(screen.getByRole('button', { name: 'First invoices' }));
  await screen.findByRole('button', { name: 'View invoice INV-1' });
  expect(readCustomerStayInvoices).toHaveBeenLastCalledWith({}, id, { limit: 20 });
});
test('SEC-003: native failed revalidation removes cached references and money until a fresh success', async () => {
  await fixture();
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'View invoice INV-1' }));
  await screen.findByText('Due PKR 8');
  jest.mocked(readCustomerStayInvoices).mockRejectedValue(Error('Private revoked access'));
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['private-invoices', id, 'own', id] });
  });
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'View invoice INV-1' })).toBeNull();
  expect(screen.queryByText('Due PKR 8')).toBeNull();
  jest.mocked(readCustomerStayInvoices).mockResolvedValue(page);
  await pullToRefresh(cache);
  await screen.findByRole('button', { name: 'View invoice INV-1' });
  expect(screen.queryByLabelText('Current invoice balance')).toBeNull();
});
test('SEC-003: native rejected balance hides references until retry discards the private selection', async () => {
  jest.mocked(readCustomerStayInvoice).mockRejectedValue(Error('Private invoice explanation'));
  await fixture();
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'View invoice INV-1' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'View invoice INV-1' })).toBeNull();
  expect(screen.queryByText(/Private invoice explanation/)).toBeNull();
  await pullToRefresh(cache);
  await screen.findByRole('button', { name: 'View invoice INV-1' });
});
test('SEC-003: native account/scope changes reset open invoices and current authority loss hides existing facts', async () => {
  const f = await fixture();
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'View invoice INV-1' }));
  await screen.findByText('Due PKR 8');
  await f.rerender(f.tree({ ...f.props, canView: false }));
  expect(screen.queryByText('Due PKR 8')).toBeNull();
  await f.rerender(f.tree({ ...f.props, actorId: next, stayId: next }));
  await screen.findByRole('button', { name: 'View invoice INV-1' });
  // The new account/Stay starts with nothing selected and reads under its own scope.
  expect(screen.queryByLabelText('Current invoice balance')).toBeNull();
  expect(readCustomerStayInvoices).toHaveBeenLastCalledWith({}, next, { limit: 20 });
});
