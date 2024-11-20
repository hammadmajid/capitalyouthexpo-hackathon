import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { billingPolicies, residentChargeCatalog } from '../src/schema/index.js';
import { validateResidentAdmissionTerms } from '../src/resident-admission-terms.js';
import {
  termsFixture as fixture,
  termsIds as ids,
  termsInput as input,
  policyRow as policy,
  catalogRow,
  catalogSnapshot,
} from './resident-admission-terms.fixture.js';
const platform = { ...policy, branchId: null },
  hostel = { ...policy, brandId: ids.brand, branchId: null },
  type = { ...policy, roomTypeId: ids.type };
it.each([platform, hostel, policy, type])(
  'RENT-003: each exact current policy scope binds explicitly agreed manual terms without financial defaults %#',
  async (row) => {
    const f = fixture({ policies: [row] });
    expect(await validateResidentAdmissionTerms(f.tx, input)).toEqual(input.terms);
    expect(f.locks).toEqual([{ table: billingPolicies, mode: 'share' }]);
    expect(f.limits).toEqual([5]);
    const predicate = f.predicates[0]?.value;
    if (!predicate) throw Error('Policy scope missing');
    expect(new PgDialect().sqlToQuery(predicate).params).toEqual([
      true,
      ids.brand,
      ids.branch,
      ids.type,
    ]);
  },
);
it.each([1, 2, 3])(
  'RENT-003: the most specific current policy wins over inherited versions %#',
  async (rank) => {
    const rows = [platform, hostel, policy, type].slice(0, rank + 1).map((row, index) => ({
      ...row,
      id: randomUUID(),
      policy: { ...row.policy, noticeDays: index + 1 },
    }));
    const selected = rows.at(-1);
    if (!selected) throw Error('Effective policy missing');
    const f = fixture({ policies: rows });
    const terms = { ...input.terms, policyVersionId: selected.id, policy: selected.policy };
    expect(await validateResidentAdmissionTerms(f.tx, { ...input, terms })).toEqual(terms);
    await expect(validateResidentAdmissionTerms(f.tx, input)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
  },
);
it.each(
  [
    [],
    [{ ...policy, id: randomUUID() }],
    [{ ...policy, policy: { ...policy.policy, graceDays: 3 } }],
  ].map((policies) => ({ policies })),
)(
  'RENT-003: missing or changed effective policy %# cannot silently alter the agreement',
  async ({ policies }) => {
    await expect(
      validateResidentAdmissionTerms(fixture({ policies }).tx, input),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  },
);
it.each(
  [
    [{ ...policy, isCurrent: false }],
    [{ ...policy, id: 'bad' }],
    [{ ...policy, policy: { ...policy.policy, graceDays: -1 } }],
    [{ ...policy, policy: { ...policy.policy, arbitraryCharges: true } }],
    [{ ...policy, branchId: randomUUID() }],
    [{ ...policy, brandId: ids.brand }],
    [{ ...type, roomTypeId: randomUUID() }],
    [{ ...type, branchId: randomUUID() }],
    [{ ...type, brandId: ids.brand }],
    [{ ...hostel, brandId: randomUUID() }],
    [policy, policy],
    Array.from({ length: 5 }, () => policy),
  ].map((policies) => ({ policies })),
)(
  'SEC-003: corrupt, foreign or duplicate authoritative policy lineage %# fails closed',
  async ({ policies }) => {
    await expect(
      validateResidentAdmissionTerms(fixture({ policies }).tx, input),
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
  },
);
it('FIN-004: each disclosed catalogue snapshot binds exact active branch entry, immutable price and safe integer paisa', async () => {
  const f = fixture(),
    terms = { ...input.terms, catalog: [catalogSnapshot] };
  expect(await validateResidentAdmissionTerms(f.tx, { ...input, terms })).toEqual(terms);
  expect(f.limits).toEqual([5, 33]);
  expect(f.locks).toEqual([
    { table: billingPolicies, mode: 'share' },
    { table: residentChargeCatalog, mode: 'share' },
  ]);
  const predicate = f.predicates[1]?.value;
  if (!predicate) throw Error('Catalogue scope missing');
  const query = new PgDialect().sqlToQuery(predicate);
  expect(query.params).toEqual([ids.branch, ids.catalog]);
  expect(query.sql).toContain('"archived_at" is null');
});
it.each([
  { unitAmountPaisa: 12302 },
  { code: 'other' },
  { name: 'Other name' },
  { unitLabel: 'Other unit' },
])('FIN-004: altered disclosed catalogue facts %# cannot be accepted', async (patch) => {
  const terms = { ...input.terms, catalog: [{ ...catalogSnapshot, ...patch }] };
  await expect(
    validateResidentAdmissionTerms(fixture().tx, { ...input, terms }),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
});
it('FIN-004: missing/archived catalogue selection is a reload conflict', async () => {
  const terms = { ...input.terms, catalog: [catalogSnapshot] };
  await expect(
    validateResidentAdmissionTerms(fixture({ catalog: [] }).tx, { ...input, terms }),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
});
it.each([
  { branchId: randomUUID() },
  { archivedAt: new Date() },
  { id: randomUUID() },
  { unitAmountPaisa: 0n },
  { unitAmountPaisa: 9007199254740992n },
  { name: '' },
])(
  'SEC-003 / FIN-004: corrupt or foreign authoritative catalogue row %# is not trusted',
  async (patch) => {
    const terms = { ...input.terms, catalog: [catalogSnapshot] };
    await expect(
      validateResidentAdmissionTerms(fixture({ catalog: [{ ...catalogRow, ...patch }] }).tx, {
        ...input,
        terms,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
  },
);
it('SEC-003: duplicate authoritative catalogue identities cannot replace a missing selection', async () => {
  const terms = {
    ...input.terms,
    catalog: [catalogSnapshot, { ...catalogSnapshot, catalogId: randomUUID(), code: 'ironing' }],
  };
  await expect(
    validateResidentAdmissionTerms(fixture({ catalog: [catalogRow, catalogRow] }).tx, {
      ...input,
      terms,
    }),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
});
it.each([
  { branchId: 'bad' },
  { brandId: 'bad' },
  { roomTypeId: 'bad' },
  { actorRole: 'owner' },
  { terms: { ...input.terms, policy: { ...input.terms.policy, graceDays: -1 } } },
])('SEC-003: invalid command boundary %# fails before queries', async (patch) => {
  const f = fixture();
  await expect(validateResidentAdmissionTerms(f.tx, { ...input, ...patch })).rejects.toThrow();
  expect(f.predicates).toEqual([]);
});
