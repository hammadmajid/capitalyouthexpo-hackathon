import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import * as sdk from './index.js';
const branch = '10000000-0000-4000-8000-000000000001';
const item = '20000000-0000-4000-8000-000000000001';
const page = {
  branchId: branch,
  type: 'residents',
  field: 'resident',
  buildingId: null,
  floorId: null,
  data: [{ id: item, name: 'Actual authorized resident', detail: null, archived: false }],
  nextCursor: null,
};
function fixture(body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://example.test',
    authentication: { kind: 'cookie', csrf: () => undefined },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(body);
    },
  });
  return { client, requests };
}
it('RPT-001 / SEC-003 / AUD-010: the public SDK reads exact bounded named report scope', async () => {
  const f = fixture(page);
  await expect(
    sdk.readReportFilterOptions(f.client, branch, 'residents', {
      field: 'resident',
      search: 'Actual',
      limit: 20,
    }),
  ).resolves.toEqual(page);
  expect(f.requests[0]?.url).toBe(
    'https://example.test/v1/branches/' +
      branch +
      '/reports/residents/options?field=resident&search=Actual&limit=20',
  );
});
it.each([
  { ...page, branchId: item },
  { ...page, type: 'payment-history' },
  { ...page, field: 'room' },
  { ...page, buildingId: item },
  { ...page, floorId: item },
  { ...page, nextCursor: item },
  { ...page, data: [...page.data, ...page.data] },
  { ...page, data: [{ ...page.data[0], phone: 'private' }] },
])(
  'SEC-003 / AUD-010: invalid named response scope never exposes a usable selector page: %o',
  async (body) => {
    const f = fixture(body);
    await expect(
      sdk.readReportFilterOptions(f.client, branch, 'residents', { field: 'resident' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('RPT-001 / AUD-010: named options retain exact parent and archive identity without invented labels', async () => {
  const value = {
    ...page,
    field: 'floor',
    buildingId: item,
    data: [{ ...page.data[0], archived: true }],
  };
  const f = fixture(value);
  await expect(
    sdk.readReportFilterOptions(f.client, branch, 'residents', {
      field: 'floor',
      buildingId: item,
    }),
  ).resolves.toEqual(value);
  const wrong = fixture({ ...value, buildingId: branch });
  await expect(
    sdk.readReportFilterOptions(wrong.client, branch, 'residents', {
      field: 'floor',
      buildingId: item,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('RPT-001 / AUD-010: empty pages are complete; stale cursors and excess rows reject', async () => {
  const empty = fixture({ ...page, data: [] });
  expect(
    (await sdk.readReportFilterOptions(empty.client, branch, 'residents', { field: 'resident' }))
      .data,
  ).toEqual([]);
  const stale = fixture(page);
  await expect(
    sdk.readReportFilterOptions(stale.client, branch, 'residents', {
      field: 'resident',
      cursor: item,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const excess = fixture({ ...page, data: [...page.data, { ...page.data[0], id: branch }] });
  await expect(
    sdk.readReportFilterOptions(excess.client, branch, 'residents', {
      field: 'resident',
      limit: 1,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003 / RPT-001 / AUD-010: invalid inputs and inapplicable resident selection make no request', async () => {
  const f = fixture(page);
  await expect(
    sdk.readReportFilterOptions(f.client, 'invalid', 'residents', { field: 'resident' }),
  ).rejects.toThrow();
  await expect(
    sdk.readReportFilterOptions(f.client, branch, 'residents', { field: 'floor' }),
  ).rejects.toThrow();
  await expect(
    sdk.readReportFilterOptions(f.client, branch, 'occupancy', { field: 'resident' }),
  ).rejects.toThrow();
  expect(f.requests).toEqual([]);
});
