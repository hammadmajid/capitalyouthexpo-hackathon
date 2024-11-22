import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { bookingPolicies } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { policyReadScope } from './policy-read.scope.js';
import { readBookingPolicy } from './policy-read.js';
import { BookingPolicyRepository } from './policy.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./policy-read.scope.js', () => ({ policyReadScope: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const brandId = randomUUID(),
  branchId = randomUUID(),
  typeId = randomUUID();
const now = new Date('2026-10-16T00:00:00Z');
const base = {
  bookingMode: 'request',
  holdSeconds: 600,
  requestExpirySeconds: 3600,
  requestReservesInventory: true,
  minimumStayDays: 1,
  maximumStayDays: 365,
  minimumAdvanceDays: 0,
  maximumAdvanceDays: 90,
  customerSelectsInventory: true,
  cancellationAllowed: true,
  cancellationCutoffHours: 24,
  allowedStayUnits: ['day'],
  allowEvidenceReuse: true,
  documentReviewRequired: false,
  requiredDocuments: ['cnic'],
};
const limits = {
  maximumHoldSeconds: 3600,
  maximumActiveHolds: 3,
  maximumRequestExpirySeconds: 86400,
  maximumAdvanceDays: 365,
  maximumFiniteStayDays: 730,
};
function layer(policy: unknown, scope = {}) {
  return {
    id: randomUUID(),
    brandId: null,
    branchId: null,
    roomTypeId: null,
    policy,
    platformLimits: limits,
    ...scope,
  };
}
const platform = layer(base),
  hostel = layer({ holdSeconds: 900 }, { brandId }),
  branch = layer({ holdSeconds: 1200 }, { branchId }),
  type = layer({ requiredDocuments: [], holdSeconds: null }, { branchId, roomTypeId: typeId });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(policyReadScope).mockResolvedValue({ brandId, branchId, typeId, canEdit: false });
});
it('BKG-006 CHG-007: current room policy resolves explicit null inheritance and optional CNIC', async () => {
  const store = queryFixture();
  store.enqueue(bookingPolicies, [type, branch, hostel, platform]);
  const result = await new BookingPolicyRepository(store.database, undefined, () => now).read(
    actor,
    { level: 'room_type', id: typeId, branchId },
  );
  expect(result).toMatchObject({
    configured: true,
    canEdit: false,
    effective: { holdSeconds: 1200, requiredDocuments: [] },
    inherited: { holdSeconds: 1200, requiredDocuments: ['cnic'] },
    localVersion: { id: type.id, level: 'room_type', scopeId: typeId },
    overrides: { holdSeconds: null, requiredDocuments: [] },
  });
  if (!result.configured) throw new Error('Expected configured policy');
  expect(result.lineage.map((row) => row.id)).toEqual([platform.id, hostel.id, branch.id, type.id]);
  expect(store.writes).toEqual([]);
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(store.predicates).toHaveLength(1);
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Expected policy predicate');
  const sql = new PgDialect().sqlToQuery(predicate.value);
  expect(sql.params).toEqual([true, brandId, branchId, typeId, branchId]);
  expect(sql.sql).toContain('is null');
  expect(JSON.stringify(result)).not.toContain(actor.userId);
});
it('BKG-006: missing local override reports inherited settings without fabricating a version', async () => {
  const store = queryFixture();
  store.enqueue(bookingPolicies, [platform, hostel, branch]);
  const result = await readBookingPolicy(
    store.transaction,
    actor,
    { level: 'room_type', id: typeId, branchId },
    () => now,
  );
  expect(result).toMatchObject({ configured: true, localVersion: null, overrides: null });
  if (!result.configured) throw new Error('Expected configured policy');
  expect(result.inherited).toEqual(result.effective);
  expect(result.lineage).toHaveLength(3);
});
it('BKG-006: an unconfigured platform returns no invented safety limits', async () => {
  const store = queryFixture();
  expect(
    await readBookingPolicy(store.transaction, actor, { level: 'branch', id: branchId }, () => now),
  ).toEqual({ configured: false, target: { level: 'branch', scopeId: branchId }, canEdit: false });
});
it('BKG-006: Root reads the persisted defaults without an inherited parent', async () => {
  const store = queryFixture();
  vi.mocked(policyReadScope).mockResolvedValue({
    brandId: null,
    branchId: null,
    typeId: null,
    canEdit: true,
  });
  store.enqueue(bookingPolicies, [platform]);
  expect(
    await readBookingPolicy(store.transaction, actor, { level: 'platform' }, () => now),
  ).toMatchObject({
    configured: true,
    inherited: null,
    overrides: null,
    canEdit: true,
    effective: base,
    limits,
  });
});
it.each(['hostel', 'branch'] as const)(
  'BKG-006: %s resolves only applicable parent layers',
  async (level) => {
    const store = queryFixture();
    vi.mocked(policyReadScope).mockResolvedValue({
      brandId,
      branchId: level === 'branch' ? branchId : null,
      typeId: null,
      canEdit: true,
    });
    store.enqueue(
      bookingPolicies,
      level === 'branch' ? [platform, hostel, branch] : [platform, hostel],
    );
    expect(
      await readBookingPolicy(
        store.transaction,
        actor,
        { level, id: level === 'branch' ? branchId : brandId },
        () => now,
      ),
    ).toMatchObject({
      configured: true,
      localVersion: { level },
      effective: { holdSeconds: level === 'branch' ? 1200 : 900 },
      inherited: { holdSeconds: level === 'branch' ? 900 : 600 },
    });
  },
);
it('SEC-003: scope denial prevents reading policies', async () => {
  const store = queryFixture();
  vi.mocked(policyReadScope).mockRejectedValue(
    new DomainError('BRANCH_FORBIDDEN', 403, 'Unavailable'),
  );
  await expect(
    readBookingPolicy(store.transaction, actor, { level: 'branch', id: branchId }, () => now),
  ).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(store.predicates).toEqual([]);
});
it('SEC-003: revocation after scope waiting prevents reading policies', async () => {
  const store = queryFixture();
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('SESSION_REVOKED', 401, 'Unavailable'));
  await expect(
    readBookingPolicy(store.transaction, actor, { level: 'branch', id: branchId }, () => now),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
  expect(store.predicates).toEqual([]);
});
it('BKG-006: invalid saved bounds fail closed rather than returning usable settings', async () => {
  const store = queryFixture();
  store.enqueue(bookingPolicies, [platform, { ...hostel, policy: { holdSeconds: 3601 } }]);
  await expect(
    readBookingPolicy(store.transaction, actor, { level: 'hostel', id: brandId }, () => now),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});
