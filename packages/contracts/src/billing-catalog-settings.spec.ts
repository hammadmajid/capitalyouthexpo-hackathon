import { expect, it } from 'vitest';
import {
  billingCatalogInputSchema as inputSchema,
  billingCatalogEntrySchema as entrySchema,
  billingCatalogPageSchema as pageSchema,
  billingCatalogQuerySchema as querySchema,
  billingCatalogArchiveSchema as archiveSchema,
} from './billing-catalog-settings.js';
const id = '10000000-0000-4000-8000-000000000001',
  next = '10000000-0000-4000-8000-000000000002';
const input = {
  code: 'electricity_kwh_v1',
  name: 'Electricity',
  unitLabel: 'kWh',
  unitAmountPaisa: 3500,
};
const entry = {
  ...input,
  id,
  branchId: id,
  createdAt: '2028-02-01T06:00:00.000Z',
  archivedAt: null,
};
const page = {
  branchId: id,
  canEdit: true,
  includeArchived: false,
  data: [entry],
  nextCursor: null,
};
it('FIN-004: only exact immutable catalogue facts are accepted and normalized', () => {
  expect(inputSchema.parse({ ...input, name: ' Electricity ', unitLabel: ' kWh ' })).toEqual(input);
  expect(
    inputSchema.parse({ ...input, unitAmountPaisa: Number.MAX_SAFE_INTEGER }).unitAmountPaisa,
  ).toBe(Number.MAX_SAFE_INTEGER);
  expect(entrySchema.parse(entry)).toEqual(entry);
  expect(pageSchema.parse(page)).toEqual(page);
  expect(querySchema.parse({})).toEqual({ limit: 20 });
  expect(
    querySchema.parse({ limit: '100', cursor: next.toUpperCase(), includeArchived: 'true' }),
  ).toEqual({ limit: 100, cursor: next, includeArchived: 'true' });
  expect(archiveSchema.parse({ reason: ' Owner retired this code ' })).toEqual({
    reason: 'Owner retired this code',
  });
});
it.each([
  { unitAmountPaisa: 0 },
  { unitAmountPaisa: -1 },
  { unitAmountPaisa: 1.5 },
  { unitAmountPaisa: Number.MAX_SAFE_INTEGER + 1 },
  { unitAmountPaisa: '3500' },
  { code: 'Electricity' },
  { code: 'bad code' },
  { name: ' ' },
  { unitLabel: ' ' },
  { name: 'a'.repeat(121) },
  { unitLabel: 'a'.repeat(41) },
  { id },
  { branchId: id },
  { createdByUserId: id },
  { paid: true },
])('FIN-004 / SEC-003: unsafe or injected catalogue creation case %# is rejected', (patch) => {
  expect(inputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
});
it.each([
  { includeArchived: true },
  { includeArchived: 'yes' },
  { limit: 101 },
  { limit: 0 },
  { cursor: 'invalid' },
  { userId: id },
])('ACC-004: unbounded or unauthorized catalogue query case %# fails', (patch) => {
  expect(querySchema.safeParse(patch).success).toBe(false);
});
it.each([
  { data: [entry, entry] },
  { data: [{ ...entry, id: next }, entry] },
  { nextCursor: next },
  { data: [{ ...entry, branchId: next }] },
  { data: [{ ...entry, archivedAt: '2028-02-02T06:00:00.000Z' }] },
  { data: [{ ...entry, archivedAt: '2028-01-31T06:00:00.000Z' }] },
  { data: [{ ...entry, actorUserId: id }] },
  { data: [{ ...entry, unitAmountPaisa: 0 }] },
  { data: Array.from({ length: 101 }, () => entry) },
])('FIN-004 / ACC-004: invalid authoritative catalogue page case %# fails closed', (patch) => {
  expect(pageSchema.safeParse({ ...page, ...patch }).success).toBe(false);
});
it('FIN-004: explicit archive visibility retains the immutable historical unit price', () => {
  const archived = { ...entry, archivedAt: '2028-02-02T06:00:00.000Z' };
  expect(pageSchema.parse({ ...page, includeArchived: true, data: [archived] }).data).toEqual([
    archived,
  ]);
  expect(
    pageSchema.parse({ ...page, data: [entry, { ...entry, id: next }], nextCursor: next })
      .nextCursor,
  ).toBe(next);
});
it.each([{ reason: ' ' }, { reason: 'x'.repeat(501) }, { reason: 'Retired', unitAmountPaisa: 1 }])(
  'AUD-004: archive reason is mandatory and cannot reprice a retained entry %#',
  (input) => {
    expect(archiveSchema.safeParse(input).success).toBe(false);
  },
);

it('ACC-004: empty catalogue pages cannot advertise a phantom continuation', () => {
  expect(pageSchema.parse({ ...page, data: [] })).toEqual({ ...page, data: [] });
  expect(pageSchema.safeParse({ ...page, data: [], nextCursor: next }).success).toBe(false);
});
