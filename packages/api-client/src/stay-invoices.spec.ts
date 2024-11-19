import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readStaffStayInvoice, readCustomerStayInvoice } from './stay-invoices.js';
const id = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const invoice = {
  invoiceId: id,
  invoiceNumber: 'INV-1',
  currency: 'PKR',
  dueDate: '2028-02-05',
  graceDays: 2,
  totalPaisa: 1000,
  debitAdjustmentsPaisa: 0,
  creditAdjustmentsPaisa: 0,
  allocatedPaisa: 0,
  outstandingPaisa: 1000,
  state: 'issued',
};
function fixture(data: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'private-access' },
      fetch,
    }),
  };
}
function call(value: ReturnType<typeof fixture>, kind: 'staff' | 'customer') {
  return kind === 'staff'
    ? readStaffStayInvoice(value.client, id, id, id)
    : readCustomerStayInvoice(value.client, id, id);
}
it.each(['staff', 'customer'] as const)(
  'FIN-001: typed %s invoice GET retains private auth and exact path without client financial overrides',
  async (kind) => {
    const f = fixture(invoice);
    expect(await call(f, kind)).toEqual(invoice);
    const request = f.fetch.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe('GET');
    expect(request.headers.get('authorization')).toBe('Bearer private-access');
    expect(request.url).toBe(
      'https://api.example.test/v1/' +
        (kind === 'staff' ? 'branches/' + id + '/' : 'me/') +
        'stays/' +
        id +
        '/invoices/' +
        id,
    );
    expect(new URL(request.url).search).toBe('');
  },
);
it.each([
  { patch: { invoiceId: other } },
  { patch: { state: 'paid' } },
  { patch: { cnic: 'private' } },
  { patch: { outstandingPaisa: 1 } },
  { patch: { amountPaisa: 1000 } },
])(
  'PAY-008 / SEC-003: foreign, false-paid or sensitive invoice result %# fails closed',
  async ({ patch }) => {
    for (const kind of ['staff', 'customer'] as const)
      await expect(call(fixture({ ...invoice, ...patch }), kind)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
  },
);
it('SEC-003: invalid branch, Stay and invoice IDs fail before network', async () => {
  const f = fixture(invoice);
  await expect(readStaffStayInvoice(f.client, 'invalid', id, id)).rejects.toThrow();
  await expect(readStaffStayInvoice(f.client, id, 'invalid', id)).rejects.toThrow();
  await expect(readStaffStayInvoice(f.client, id, id, 'invalid')).rejects.toThrow();
  await expect(readCustomerStayInvoice(f.client, 'invalid', id)).rejects.toThrow();
  await expect(readCustomerStayInvoice(f.client, id, 'invalid')).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
it.each([403, 404, 503])(
  'FIN-001: inaccessible invoice HTTP%s never becomes a zero or paid fallback',
  async (status) => {
    for (const kind of ['staff', 'customer'] as const)
      await expect(call(fixture({ error: 'denied' }, status), kind)).rejects.toThrow();
  },
);
it('FIN-001: a valid receipt-backed Paid projection retains exact integer paisa', async () => {
  const paid = { ...invoice, allocatedPaisa: 1000, outstandingPaisa: 0, state: 'paid' };
  expect(await call(fixture(paid), 'customer')).toEqual(paid);
});
