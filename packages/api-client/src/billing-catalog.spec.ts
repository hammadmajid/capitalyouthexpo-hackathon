import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  readBillingCatalog,
  createBillingCatalogEntry,
  archiveBillingCatalogEntry,
} from './billing-catalog.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  id = '10000000-0000-4000-8000-000000000002',
  next = '10000000-0000-4000-8000-000000000003',
  key = '10000000-0000-4000-8000-000000000004';
const input = {
  code: 'electricity_kwh_v1',
  name: 'Electricity',
  unitLabel: 'kWh',
  unitAmountPaisa: 3500,
};
const entry = { ...input, id, branchId, createdAt: '2028-02-01T06:00:00.000Z', archivedAt: null };
const page = { branchId, canEdit: true, includeArchived: false, data: [entry], nextCursor: null };
function fixture(body: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'cookie', csrf: () => 'csrf-fixture' },
      fetch,
    }),
  };
}
function request(f: ReturnType<typeof fixture>) {
  const value = f.fetch.mock.calls[0]?.[0];
  if (!(value instanceof Request)) throw Error('Missing request');
  return value;
}
it('FIN-004 / ACC-004: catalogue reads bind exact branch, bounded cursor and explicit archive visibility', async () => {
  const archived = { ...entry, id: next, archivedAt: '2028-02-02T06:00:00.000Z' },
    body = { ...page, canEdit: false, includeArchived: true, data: [archived] },
    f = fixture(body);
  expect(
    await readBillingCatalog(f.client, branchId.toUpperCase(), {
      cursor: id.toUpperCase(),
      limit: 1,
      includeArchived: 'true',
    }),
  ).toEqual(body);
  const url = new URL(request(f).url);
  expect(url.pathname).toBe('/v1/branches/' + branchId + '/charge-catalog');
  expect(url.searchParams.get('cursor')).toBe(id);
  expect(url.searchParams.get('limit')).toBe('1');
  expect(url.searchParams.get('includeArchived')).toBe('true');
  expect(request(f).method).toBe('GET');
});
it('FIN-004: absent catalogue is empty, and unspecified wire optionals are omitted', async () => {
  const body = { ...page, data: [] },
    f = fixture(body);
  expect(
    await readBillingCatalog(f.client, branchId, { cursor: undefined, includeArchived: undefined }),
  ).toEqual(body);
  const url = new URL(request(f).url);
  expect(url.searchParams.get('limit')).toBe('20');
  expect(url.searchParams.has('cursor')).toBe(false);
  expect(url.searchParams.has('includeArchived')).toBe(false);
});
it('FIN-004 / SEC-003: create sends only normalized approved facts with stable idempotency and CSRF', async () => {
  const f = fixture(entry, 201);
  expect(
    await createBillingCatalogEntry(
      f.client,
      branchId.toUpperCase(),
      { ...input, name: ' Electricity ' },
      key.toUpperCase(),
    ),
  ).toEqual(entry);
  const sent = request(f);
  expect(sent.method).toBe('POST');
  expect(sent.url).toBe('https://api.example.test/v1/branches/' + branchId + '/charge-catalog');
  expect(sent.headers.get('Idempotency-Key')).toBe(key);
  expect(sent.headers.get('X-CSRF-Token')).toBe('csrf-fixture');
  expect(await sent.json()).toEqual(input);
});
it('FIN-004 / AUD-004: archive names one exact child and sends only the reason', async () => {
  const body = { ...entry, archivedAt: '2028-02-02T06:00:00.000Z' },
    f = fixture(body);
  expect(
    await archiveBillingCatalogEntry(
      f.client,
      { branchId: branchId.toUpperCase(), catalogId: id.toUpperCase() },
      { reason: ' Retired ' },
      key,
    ),
  ).toEqual(body);
  expect(request(f).url).toBe(
    'https://api.example.test/v1/branches/' + branchId + '/charge-catalog/' + id + '/archive',
  );
  expect(request(f).headers.get('Idempotency-Key')).toBe(key);
  expect(await request(f).json()).toEqual({ reason: 'Retired' });
});
it.each([
  { branchId: next, data: [] },
  { includeArchived: true, data: [] },
  { data: [entry, { ...entry, id: next }] },
])(
  'ACC-004: mismatched catalogue scope/view/limit response %# cannot be accepted',
  async (patch) => {
    const f = fixture({ ...page, ...patch });
    await expect(readBillingCatalog(f.client, branchId, { limit: 1 })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  },
);
it('ACC-004: stale or reversed catalogue continuation cannot be accepted', async () => {
  const f = fixture(page);
  await expect(readBillingCatalog(f.client, branchId, { cursor: next })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it.each([
  { branchId: next },
  { code: 'different_code' },
  { name: 'Different name' },
  { unitLabel: 'different unit' },
  { unitAmountPaisa: 3501 },
  { archivedAt: '2028-02-02T06:00:00.000Z' },
])('FIN-004: mismatched creation facts response %# cannot show success', async (patch) => {
  const f = fixture({ ...entry, ...patch }, 201);
  await expect(createBillingCatalogEntry(f.client, branchId, input, key)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it.each([{ branchId: next }, { id: next }, { archivedAt: null }])(
  'FIN-004: wrong-scope or unchanged archive response %# cannot show success',
  async (patch) => {
    const f = fixture({ ...entry, archivedAt: '2028-02-02T06:00:00.000Z', ...patch });
    await expect(
      archiveBillingCatalogEntry(f.client, { branchId, catalogId: id }, { reason: 'Retired' }, key),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('SEC-003: unknown private response fields fail strict catalogue DTO validation', async () => {
  const f = fixture({ ...page, data: [{ ...entry, privateFiles: ['secret'] }] });
  await expect(readBillingCatalog(f.client, branchId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('FIN-004 / SEC-003: invalid catalogue commands/queries fail before network work', async () => {
  const f = fixture(entry);
  await expect(readBillingCatalog(f.client, 'invalid')).rejects.toThrow();
  await expect(readBillingCatalog(f.client, branchId, { includeArchived: true })).rejects.toThrow();
  await expect(
    createBillingCatalogEntry(f.client, branchId, { ...input, unitAmountPaisa: 0 }, key),
  ).rejects.toThrow();
  await expect(createBillingCatalogEntry(f.client, branchId, input, 'invalid')).rejects.toThrow();
  await expect(
    archiveBillingCatalogEntry(
      f.client,
      { branchId, catalogId: id, userId: next },
      { reason: 'Retired' },
      key,
    ),
  ).rejects.toThrow();
  await expect(
    archiveBillingCatalogEntry(f.client, { branchId, catalogId: id }, { reason: ' ' }, key),
  ).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
