import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { residents, hostelAuditLog } from '../src/schema/index.js';
import { resolveResidentAdmissionParty } from '../src/resident-admission-party.js';
import {
  partyFixture as fixture,
  partyIds as ids,
  partyTime as now,
  partyInput as input,
  partyRow as row,
} from './resident-admission-party.fixture.js';
const existing = { ...input, resident: { kind: 'existing', residentId: ids.resident } };
it('RES-001/003 / AUD-004: manual relationship is normalized, branch-local and audited, never a fabricated login or contact merge', async () => {
  const f = fixture(),
    result = await resolveResidentAdmissionParty(f.tx, input, now);
  expect(result).toMatchObject({
    branchId: ids.branch,
    userId: null,
    displayName: 'Walk-in Resident',
  });
  expect(result.residentId).toMatch(/^[0-9a-f-]{36}$/);
  expect(f.predicates).toEqual([]);
  expect(f.writes.map((value) => value.table)).toEqual([residents, hostelAuditLog]);
  expect(f.writes.at(0)?.value).toEqual({
    id: result.residentId,
    branchId: ids.branch,
    userId: null,
    displayName: 'Walk-in Resident',
    phone: '+923001234567',
    email: 'resident@example.invalid',
    createdByUserId: ids.actor,
    createdAt: now,
    updatedAt: now,
  });
  expect(f.writes.at(1)?.value).toMatchObject({
    organizationId: ids.organization,
    branchId: ids.branch,
    actorUserId: ids.actor,
    actorRole: 'owner',
    action: 'resident.relationship.created',
    targetType: 'resident',
    targetId: result.residentId,
    after: { residentId: result.residentId, accountLinked: false },
  });
});
it('RES-001: omitted manual contact details stay null rather than synthetic addresses/numbers', async () => {
  const f = fixture();
  await resolveResidentAdmissionParty(
    f.tx,
    { ...input, resident: { kind: 'new', profile: { displayName: 'Resident' } } },
    now,
  );
  expect(f.writes.at(0)?.value).toMatchObject({ phone: null, email: null, userId: null });
});
it.each([null, ids.user])(
  'RES-003: existing explicit account binding%s is retained without a new relationship or User mutation',
  async (userId) => {
    const f = fixture({ rows: [{ ...row, userId }] });
    expect(
      await resolveResidentAdmissionParty(f.tx, { ...existing, expectedUserId: userId }, now),
    ).toEqual({
      residentId: ids.resident,
      branchId: ids.branch,
      userId,
      displayName: row.displayName,
    });
    expect(f.writes).toEqual([]);
    expect(f.locks).toEqual([{ table: residents, mode: 'update' }]);
    const predicate = f.predicates[0];
    if (!predicate) throw Error('Scope predicate missing');
    expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([ids.branch, ids.resident]);
  },
);
it.each([
  { rows: [], code: 'NOT_FOUND' },
  { rows: [{ ...row, id: randomUUID() }], code: 'INTERNAL' },
  { rows: [{ ...row, branchId: randomUUID() }], code: 'INTERNAL' },
  { rows: [{ ...row, userId: 'bad' }], code: 'INTERNAL' },
  { rows: [{ ...row, displayName: '' }], code: 'INTERNAL' },
  { rows: [{ ...row, archivedAt: now }], code: 'CONFLICT' },
  { rows: [{ ...row, userId: ids.user }], code: 'CONFLICT' },
])(
  'SEC-003 / RES-003: foreign, corrupt, archived or changed relationship %# cannot be admitted silently',
  async ({ rows, code }) => {
    const f = fixture({ rows });
    await expect(resolveResidentAdmissionParty(f.tx, existing, now)).rejects.toMatchObject({
      code,
    });
    expect(f.writes).toEqual([]);
  },
);
it('RES-003: a preflight-linked account cannot silently become an offline relationship', async () => {
  const f = fixture();
  await expect(
    resolveResidentAdmissionParty(f.tx, { ...existing, expectedUserId: ids.user }, now),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.writes).toEqual([]);
});
it.each([residents, hostelAuditLog])(
  'AUD-004 / ACC-004: required relationship write %# failure propagates to caller rollback',
  async (fail) => {
    await expect(resolveResidentAdmissionParty(fixture({ fail }).tx, input, now)).rejects.toThrow(
      'Required relationship write failed',
    );
  },
);
it.each([
  { expectedUserId: ids.user },
  { scope: { ...input.scope, actorRole: 'customer' } },
  { scope: { ...input.scope, actorRole: 'system' } },
  { resident: { kind: 'new', profile: { displayName: 'Resident', userId: ids.user } } },
  {
    resident: {
      kind: 'existing',
      residentId: ids.resident,
      profile: { displayName: 'Replacement' },
    },
  },
  { scope: { ...input.scope, branchId: 'bad' } },
  { expectedUserId: 'bad' },
])(
  'SEC-003 / RES-003: injected identity, role or scope %# fails before relationship reads/writes',
  async (patch) => {
    const f = fixture();
    await expect(
      resolveResidentAdmissionParty(f.tx, { ...input, ...patch }, now),
    ).rejects.toThrow();
    expect(f.writes).toEqual([]);
    expect(f.predicates).toEqual([]);
  },
);
it('SEC-003: invalid server clock cannot create or read a relationship', async () => {
  const f = fixture();
  await expect(resolveResidentAdmissionParty(f.tx, input, new Date(Number.NaN))).rejects.toThrow();
  expect(f.writes).toEqual([]);
  expect(f.predicates).toEqual([]);
});
