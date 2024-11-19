import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readStaffStayReceipt, readCustomerStayReceipt } from './stay-receipts.js';
const id = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const receipt = {
  receiptId: id,
  receiptNumber: 'R-1',
  issuedAt: '2028-02-01T06:00:00.000Z',
  reversed: false,
  snapshot: {
    version: 1,
    currency: 'PKR',
    paymentId: id,
    branchId: id,
    stayId: id,
    residentName: 'Historical resident',
    hostelName: 'Historical hostel',
    branchName: 'Historical branch',
    amountPaisa: 1001,
    method: 'cash',
    transactionReference: null,
    paidOn: '2028-02-01',
    approvedAt: '2028-02-01T06:00:00.000Z',
    allocations: [],
    distribution: { allocatedPaisa: 0, depositPaisa: 1000, advanceCreditPaisa: 1 },
  },
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
function call(f: ReturnType<typeof fixture>, kind: 'staff' | 'customer') {
  return kind === 'staff'
    ? readStaffStayReceipt(f.client, id, id, id)
    : readCustomerStayReceipt(f.client, id, id);
}
it.each(['staff', 'customer'] as const)(
  'PAY-008: typed %s receipt GET binds authenticated exact path and retains original facts',
  async (kind) => {
    const f = fixture(receipt);
    expect(await call(f, kind)).toEqual(receipt);
    const request = f.fetch.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe('GET');
    expect(request.headers.get('authorization')).toBe('Bearer private-access');
    expect(request.url).toBe(
      'https://api.example.test/v1/' +
        (kind === 'staff' ? 'branches/' + id + '/' : 'me/') +
        'stays/' +
        id +
        '/receipts/' +
        id,
    );
    expect(new URL(request.url).search).toBe('');
  },
);
it.each([
  { patch: { receiptId: other } },
  { patch: { snapshot: { ...receipt.snapshot, stayId: other } } },
  { patch: { snapshot: { ...receipt.snapshot, cnic: 'Private' } } },
  { patch: { proofFileId: other } },
  { patch: { reversed: 'false' } },
  {
    patch: {
      snapshot: {
        ...receipt.snapshot,
        distribution: { ...receipt.snapshot.distribution, allocatedPaisa: 1 },
      },
    },
  },
])('SEC-003 / FIN-001: mismatched/private/corrupt receipt %# fails closed', async ({ patch }) => {
  for (const kind of ['staff', 'customer'] as const)
    await expect(call(fixture({ ...receipt, ...patch }), kind)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
});
it('SEC-003: staff SDK rejects another branch receipt even with matching Stay/receipt IDs', async () => {
  await expect(
    call(fixture({ ...receipt, snapshot: { ...receipt.snapshot, branchId: other } }), 'staff'),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003: invalid receipt route identifiers fail before network access', async () => {
  const f = fixture(receipt);
  await expect(readStaffStayReceipt(f.client, 'bad', id, id)).rejects.toThrow();
  await expect(readStaffStayReceipt(f.client, id, 'bad', id)).rejects.toThrow();
  await expect(readStaffStayReceipt(f.client, id, id, 'bad')).rejects.toThrow();
  await expect(readCustomerStayReceipt(f.client, 'bad', id)).rejects.toThrow();
  await expect(readCustomerStayReceipt(f.client, id, 'bad')).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
it.each([403, 404, 503])(
  'FIN-001: denied receipt HTTP%s never becomes an empty success',
  async (status) => {
    for (const kind of ['staff', 'customer'] as const)
      await expect(call(fixture({ error: 'denied' }, status), kind)).rejects.toThrow();
  },
);
it('PAY-008: SDK preserves derived reversal marker and original receipt facts', async () => {
  const value = { ...receipt, reversed: true };
  expect(await call(fixture(value), 'customer')).toEqual(value);
});
