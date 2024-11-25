import { vi, type Mock } from 'vitest';
import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
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
import { browserClient } from '../lib/client';
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
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: ids.branch,
    permissions: ['stay_manage', 'finance_view', 'payment_record'],
    canConfigureManagers: false,
  });
  vi.mocked(readStaffStay).mockResolvedValue(paymentStay);
  vi.mocked(readStaffStays).mockResolvedValue({ data: [paymentStay], nextCursor: null });
  vi.mocked(readStaffStayInvoices).mockResolvedValue({
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
  vi.mocked(readStaffStayInvoice).mockResolvedValue({
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
  vi.mocked(readStaffStayReceipt).mockResolvedValue(paymentReceipt);
}
type PaymentProps = {
  actorId: string;
  branchId: string;
  stayId: string;
  unavailable: boolean;
  onClose: Mock<() => void>;
};
export function paymentFixture(directory = false): RenderResult & {
  cache: QueryClient;
  fetch: Mock<typeof globalThis.fetch>;
  props: PaymentProps;
  tree: (value?: PaymentProps) => ReactElement;
  onClose: Mock<() => void>;
} {
  const cache = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
    fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => Response.json(paymentResult, { status: 201 })),
    client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch,
      authentication: { kind: 'cookie', csrf: () => 'fixture-csrf' },
    }),
    onClose = vi.fn<() => void>();
  vi.mocked(browserClient).mockReturnValue(client);
  const props = {
    actorId: ids.actor,
    branchId: ids.branch,
    stayId: ids.stay,
    unavailable: false,
    onClose,
  };
  const tree = (value = props) => (
    <QueryClientProvider client={cache}>
      {directory ? (
        <StayDirectory
          actorId={value.actorId}
          branchId={value.branchId}
          accessUnavailable={value.unavailable}
        />
      ) : (
        <StaffStayPayment {...value} />
      )}
    </QueryClientProvider>
  );
  return { ...render(tree()), cache, fetch, props, tree, onClose };
}
export function paymentRequest(f: ReturnType<typeof paymentFixture>, second = false) {
  const value = second ? f.fetch.mock.calls[1]?.[0] : f.fetch.mock.calls[0]?.[0];
  if (!(value instanceof Request)) throw Error('Actual payment request missing');
  return value;
}
