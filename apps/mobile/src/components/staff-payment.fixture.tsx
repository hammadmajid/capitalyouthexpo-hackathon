/// <reference types="jest" />
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createApiClient,
  readInventoryAccess,
  readStaffStay,
  readStaffStays,
  readStaffStayInvoices,
  readStaffStayInvoice,
  readStaffStayReceipt,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { StaffStayPayment } from './staff-stay-payment';
import { StayDirectory } from './stay-directory';
export const paymentIds = {
  actor: '10000000-0000-4000-8000-000000000001',
  branch: '10000000-0000-4000-8000-000000000002',
  stay: '10000000-0000-4000-8000-000000000003',
  invoice: '10000000-0000-4000-8000-000000000004',
  payment: '10000000-0000-4000-8000-000000000005',
  receipt: '10000000-0000-4000-8000-000000000006',
};
const ids = paymentIds;
export const paymentResult = {
  paymentId: ids.payment,
  receiptId: ids.receipt,
  receiptNumber: 'R-1',
  amountPaisa: 1001,
};
export const paymentStay: Awaited<ReturnType<typeof readStaffStay>> = {
  id: ids.stay,
  branchId: ids.branch,
  residentId: ids.stay,
  displayName: 'Selected resident',
  source: 'manual',
  state: 'active',
  version: 1,
  moveInDate: '2028-02-01',
  expectedLeaveDate: null,
  checkedInAt: '2028-02-01T06:00:00.000Z',
  closedAt: null,
  currentAssignment: null,
  bookingId: null,
  contact: { phone: null, email: null },
};
export const paymentReceipt: Awaited<ReturnType<typeof readStaffStayReceipt>> = {
  receiptId: ids.receipt,
  receiptNumber: 'R-1',
  issuedAt: '2028-03-01T06:00:00.000Z',
  reversed: false,
  snapshot: {
    version: 1,
    currency: 'PKR',
    paymentId: ids.payment,
    branchId: ids.branch,
    stayId: ids.stay,
    residentName: 'Original resident',
    hostelName: 'Original hostel',
    branchName: 'Original branch',
    amountPaisa: 1001,
    method: 'cash',
    transactionReference: null,
    paidOn: '2028-03-01',
    approvedAt: '2028-03-01T06:00:00.000Z',
    allocations: [{ invoiceId: ids.invoice, invoiceNumber: 'INV-1', amountPaisa: 1001 }],
    distribution: { allocatedPaisa: 1001, depositPaisa: 0, advanceCreditPaisa: 0 },
  },
};
export function paymentMocks() {
  jest.mocked(readInventoryAccess).mockResolvedValue({
    branchId: ids.branch,
    permissions: ['stay_manage', 'finance_view', 'payment_record'],
    canConfigureManagers: false,
  });
  jest.mocked(readStaffStay).mockResolvedValue(paymentStay);
  jest.mocked(readStaffStays).mockResolvedValue({ data: [paymentStay], nextCursor: null });
  jest.mocked(readStaffStayInvoices).mockResolvedValue({
    branchId: ids.branch,
    stayId: ids.stay,
    data: [
      {
        invoiceId: ids.invoice,
        invoiceNumber: 'INV-1',
        dueDate: '2028-03-01',
        issuedAt: '2028-02-01T06:00:00.000Z',
        documentState: 'issued',
      },
    ],
    nextCursor: null,
  });
  jest.mocked(readStaffStayInvoice).mockResolvedValue({
    invoiceId: ids.invoice,
    invoiceNumber: 'INV-1',
    currency: 'PKR',
    dueDate: '2028-03-01',
    graceDays: 2,
    totalPaisa: 1001,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    allocatedPaisa: 0,
    outstandingPaisa: 1001,
    state: 'issued',
  });
  jest.mocked(readStaffStayReceipt).mockResolvedValue(paymentReceipt);
}

export async function paymentFixture(directory = false) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const fetch = jest
    .fn<ReturnType<typeof globalThis.fetch>, Parameters<typeof globalThis.fetch>>()
    .mockImplementation(async () => Response.json(paymentResult, { status: 201 }));
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch,
    authentication: { kind: 'bearer', accessToken: async () => 'fixture-access' },
  });
  jest.mocked(actorClient).mockResolvedValue(client);
  const onClose = jest.fn(() => undefined);
  const props = {
    actorId: ids.actor,
    branchId: ids.branch,
    stayId: ids.stay,
    unavailable: false,
    onClose,
  };
  await render(
    <QueryClientProvider client={cache}>
      {directory ? (
        <StayDirectory actorId={ids.actor} branchId={ids.branch} />
      ) : (
        <StaffStayPayment {...props} />
      )}
    </QueryClientProvider>,
  );
  return { cache, fetch, props, onClose };
}
export function paymentRequest(f: Awaited<ReturnType<typeof paymentFixture>>, second = false) {
  const payments = f.fetch.mock.calls
    .map((call) => call[0])
    .filter(
      (value): value is Request =>
        value instanceof Request && value.method === 'POST' && value.url.includes('/payments'),
    );
  const value = payments[second ? 1 : 0];
  if (!(value instanceof Request)) throw Error('Actual payment request missing');
  return value;
}
