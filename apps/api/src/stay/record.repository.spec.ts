import { agreementDigest } from './agreement-acceptance.repository.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { branches, stayAgreements, stayAssignments, stayHistory, stays } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { StayRecordRepository } from './record.repository.js';
import { stayRecordService, StayRecordService } from './record.service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const branch = '10000000-0000-4000-8000-000000000001',
  stay = '10000000-0000-4000-8000-000000000002',
  policy = '10000000-0000-4000-8000-000000000003',
  room = '10000000-0000-4000-8000-000000000004';
const actor = { userId: '10000000-0000-4000-8000-000000000005' } as never;
const now = new Date('2026-10-25T10:00:00Z');
const terms = {
  policyVersionId: policy,
  currency: 'PKR',
  fees: [],
  catalog: [],
  rentAmountPaisa: 1800000,
  depositPaisa: 0,
  policy: {
    cycle: { kind: 'calendar_month', dueDay: 5 },
    proration: { kind: 'full_period' },
    graceDays: 0,
    lateCharge: { kind: 'disabled' },
    noticeDays: 15,
    earlyCheckout: { kind: 'manual' },
    allowOpenEnded: true,
    customCharges: 'disabled',
  },
};
function seed(agreementTerms: unknown = terms, histories = 1, versions = [1]) {
  const store = queryFixture();
  store.enqueue(stays, [{ id: stay, branchId: branch }]);
  store.enqueue(branches, [{ id: branch, name: 'Branch A' }]);
  store.enqueue(
    stayAgreements,
    versions.map((version) => ({
      id: version === 1 ? stay : '20000000-0000-4000-8000-' + String(version).padStart(12, '0'),
      version,
      effectiveFrom: '2026-10-01',
      termsSnapshot: agreementTerms,
      bookingSnapshot: { id: 'booking' },
      createdAt: now,
    })),
  );
  store.enqueue(stayAssignments, [
    {
      id: room,
      roomTypeId: room,
      roomTypeName: 'Standard',
      roomId: room,
      roomLabel: '101',
      bedId: null,
      bedLabel: null,
      startedAt: now,
      endedAt: null,
    },
  ]);
  store.enqueue(
    stayHistory,
    Array.from({ length: histories }, () => ({
      id: stay,
      previousState: null,
      nextState: 'active',
      reasonCode: 'manual_admission',
      createdAt: now,
    })),
  );
  return store;
}
it('STAY-002: staff record returns the original agreement, labels and safe history', async () => {
  const store = seed();
  const record = await new StayRecordRepository(store.database, () => now).staff(
    actor,
    branch,
    stay,
  );
  expect(record).toMatchObject({
    stayId: stay,
    branch: { id: branch, name: 'Branch A' },
    agreements: [{ version: 1, fromBooking: true, terms: { rentAmountPaisa: 1800000 } }],
    assignments: [{ roomLabel: '101', bedLabel: null, endedAt: null }],
    history: [{ nextState: 'active' }],
    truncated: false,
  });
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, branch, 'stay_manage');
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(store.writes).toHaveLength(0);
});
it('STAY-002: long history is truncated to the newest rows', async () => {
  const record = await new StayRecordRepository(seed(terms, 51).database, () => now).own(
    actor,
    stay,
  );
  expect(record.history).toHaveLength(50);
  expect(record.truncated).toBe(true);
  expect(lockInventoryScope).not.toHaveBeenCalled();
});
it('SEC-003: missing Stays are unavailable and invalid snapshots are internal errors', async () => {
  const repository = new StayRecordRepository(queryFixture().database, () => now);
  await expect(repository.staff(actor, branch, stay)).rejects.toMatchObject({ status: 404 });
  await expect(repository.own(actor, stay)).rejects.toMatchObject({ status: 404 });
  await expect(
    new StayRecordRepository(seed({ bad: true }).database, () => now).staff(actor, branch, stay),
  ).rejects.toMatchObject({ status: 500 });
  const noBranch = queryFixture();
  noBranch.enqueue(stays, [{ id: stay, branchId: branch }]);
  await expect(
    new StayRecordRepository(noBranch.database, () => now).staff(actor, branch, stay),
  ).rejects.toMatchObject({ status: 500 });
});
it('STAY-002: the service validates identifiers and builds the production repository', async () => {
  const service = stayRecordService(seed().database, () => now);
  expect(service).toBeInstanceOf(StayRecordService);
  await expect(service.staff(actor, branch, stay)).resolves.toMatchObject({ stayId: stay });
  await expect(service.own(actor, 'bad')).rejects.toThrow();
});

it('STAY-002: agreement evidence uses stable canonical terms, not JSON key order', () => {
  expect(agreementDigest({ rent: 100, policy: { grace: 2, due: 5 } })).toBe(
    agreementDigest({ policy: { due: 5, grace: 2 }, rent: 100 }),
  );
  expect(agreementDigest({ rent: 100 })).not.toBe(agreementDigest({ rent: 101 }));
});

it('STAY-002: bounded descending agreement pages expose an exact continuation without losing original versions', async () => {
  const first = await new StayRecordRepository(
    seed(
      terms,
      1,
      Array.from({ length: 51 }, (_, i) => 52 - i),
    ).database,
    () => now,
  ).own(actor, stay);
  expect(first.agreements).toHaveLength(50);
  expect(first.agreements.at(-1)?.version).toBe(3);
  expect(first.nextAgreementBeforeVersion).toBe(3);
  const last = await new StayRecordRepository(seed(terms, 1, [2, 1]).database, () => now).own(
    actor,
    stay,
    { beforeAgreementVersion: 3 },
  );
  expect(last.agreements.map((row) => row.version)).toEqual([2, 1]);
  expect(last.nextAgreementBeforeVersion).toBeUndefined();
});
