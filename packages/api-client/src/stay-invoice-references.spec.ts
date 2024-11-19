import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  readCustomerStayInvoices as own,
  readStaffStayInvoices as staff,
} from './stay-invoice-references.js';
const branch = '10000000-0000-4000-8000-000000000001';
const stay = '10000000-0000-4000-8000-000000000002';
const first = '10000000-0000-4000-8000-000000000003';
const second = '10000000-0000-4000-8000-000000000004';
const row = {
  invoiceId: first,
  invoiceNumber: 'INV-1',
  dueDate: '2028-03-01',
  issuedAt: '2028-02-01T06:00:00.000Z',
  documentState: 'issued',
};
const page = { branchId: branch, stayId: stay, data: [row], nextCursor: null };
function fixture(value: unknown = page) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(value));
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch,
    authentication: { kind: 'bearer', accessToken: async () => 'fixture-access' },
  });
  return { fetch, client };
}
function call(f: ReturnType<typeof fixture>, kind: 'staff' | 'own', query: unknown = {}) {
  return kind === 'staff' ? staff(f.client, branch, stay, query) : own(f.client, stay, query);
}
function sent(f: ReturnType<typeof fixture>) {
  const value = f.fetch.mock.calls[0]?.[0];
  if (!(value instanceof Request)) throw Error('Actual Request missing');
  return value;
}
it.each(['staff', 'own'] as const)(
  'FIN-001 / SEC-003: %s references bind exact scoped paths and bounded defaults',
  async (kind) => {
    const f = fixture();
    expect(await call(f, kind)).toEqual(page);
    const url = new URL(sent(f).url);
    expect(url.pathname).toBe(
      kind === 'staff'
        ? '/v1/branches/' + branch + '/stays/' + stay + '/invoices'
        : '/v1/me/stays/' + stay + '/invoices',
    );
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.has('cursor')).toBe(false);
    expect(sent(f).headers.get('authorization')).toBe('Bearer fixture-access');
    expect(f.fetch).toHaveBeenCalledTimes(1);
  },
);
it.each(['staff', 'own'] as const)(
  'FIN-001: %s next page sends actual exclusive cursor and exact bounded continuation',
  async (kind) => {
    const next = { ...page, data: [{ ...row, invoiceId: second }], nextCursor: second };
    const f = fixture(next);
    expect(await call(f, kind, { cursor: first, limit: 1 })).toEqual(next);
    expect(new URL(sent(f).url).searchParams.get('cursor')).toBe(first);
    expect(new URL(sent(f).url).searchParams.get('limit')).toBe('1');
  },
);
it.each([
  { ...page, stayId: first },
  { ...page, residentName: 'private' },
  { ...page, data: [{ ...row, amountPaisa: 1 }] },
  { ...page, data: [{ ...row, documentState: 'paid' }] },
  { ...page, nextCursor: second },
  { ...page, data: [], nextCursor: first },
  { ...page, data: [row, row] },
  { ...page, data: [{ ...row, invoiceId: second }, row] },
])(
  'SEC-003: both readers reject wrong target, expanded or inconsistent pages %#',
  async (value) => {
    for (const kind of ['staff', 'own'] as const) {
      const f = fixture(value);
      await expect(call(f, kind)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  },
);
it('SEC-003: staff branch binding and requested page boundary are independently enforced', async () => {
  const foreign = fixture({ ...page, branchId: first });
  await expect(call(foreign, 'staff')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  for (const kind of ['staff', 'own'] as const) {
    const before = fixture();
    await expect(call(before, kind, { cursor: first })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    const short = fixture({ ...page, nextCursor: first });
    await expect(call(short, kind, { limit: 2 })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    const large = fixture({ ...page, data: [row, { ...row, invoiceId: second }] });
    await expect(call(large, kind, { limit: 1 })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  }
});
it.each([
  { limit: 0 },
  { limit: 101 },
  { cursor: 'bad' },
  { userId: first },
  { paid: true },
  { includePrivate: true },
])('SEC-003: invalid or authority-expanded query never reaches transport %#', async (query) => {
  for (const kind of ['staff', 'own'] as const) {
    const f = fixture();
    await expect(call(f, kind, query)).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  }
});
it('SEC-003: invalid path identifiers reject before transport', async () => {
  const f = fixture();
  await expect(staff(f.client, 'bad', stay)).rejects.toThrow();
  await expect(staff(f.client, branch, 'bad')).rejects.toThrow();
  await expect(own(f.client, 'bad')).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
it('ACC-004: lost read is a typed error without fabricated empty results or hidden retries', async () => {
  const f = fixture();
  f.fetch.mockRejectedValueOnce(Error('Offline'));
  await expect(call(f, 'own')).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
