import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stays, stayHistory, hostelAuditLog } from '../src/schema/index.js';
import { recordResidentNotice } from '../src/resident-notice.js';
import { lockInventoryBranch } from '../src/inventory-lock.js';
import {
  noticeFixture as fixture,
  noticeCommand as input,
  noticeIds as ids,
  noticeTime as now,
} from './resident-notice.fixture.js';
const control = vi.hoisted(() => ({ archived: null as string | null }));
vi.mock('../src/inventory-lock.js', () => ({
  lockInventoryBranch: vi.fn(async () => ({
    organization: { id: ids.organization, archivedAt: control.archived },
    brand: { archivedAt: null },
    branch: { archivedAt: null },
  })),
}));
beforeEach(() => {
  vi.clearAllMocks();
  control.archived = null;
});
const authorize = vi.fn(async () => undefined),
  publish = vi.fn(async () => undefined);
function run(f: ReturnType<typeof fixture>, value: unknown = input) {
  return recordResidentNotice(f.tx, value, now, authorize, publish);
}
it('OUT-001/006 / AUD-004: notice preserves exact original policy/history, increments state and never releases inventory or posts money', async () => {
  const f = fixture(),
    result = await run(f);
  expect(result).toMatchObject({
    stayId: ids.stay,
    state: 'notice_given',
    version: 2,
    plan: {
      requiredNoticeDays: 15,
      providedNoticeDays: 9,
      shortfallDays: 6,
      earliestCompliantCheckoutDate: '2028-02-16',
      policyVersionId: ids.policy,
    },
  });
  expect(authorize).toHaveBeenCalledWith(f.tx, input.scope, now);
  expect(f.writes.map((row) => row.table)).toEqual([stays, stayHistory, hostelAuditLog]);
  expect(f.writes.at(0)?.value).toEqual({
    state: 'notice_given',
    version: 2,
    updatedAt: now,
  });
  expect(f.writes.at(1)?.value).toMatchObject({
    id: result.noticeId,
    previousState: 'active',
    nextState: 'notice_given',
    reasonCode: 'notice_submitted',
    detail: { agreementId: ids.agreement, shortfallDays: 6, reason: null },
  });
  expect(f.writes.at(2)?.value).toMatchObject({
    actorUserId: ids.actor,
    actorRole: 'owner',
    action: 'resident.notice.submitted',
    targetId: ids.stay,
  });
  expect(f.locks).toEqual([{ table: stays, mode: 'update' }]);
  expect(publish).not.toHaveBeenCalled();
  const dialect = new PgDialect();
  expect(f.predicates.map((row) => dialect.sqlToQuery(row.value).params)).toEqual([
    [ids.branch, ids.stay],
    [ids.branch, ids.stay, '2028-02-01'],
    [ids.branch, ids.stay, 1],
  ]);
});
it('OUT-002: linked self emergency notice retains reason and required delivery inside exact transaction', async () => {
  const f = fixture({ stay: { userId: ids.actor } }),
    value = {
      ...input,
      scope: { ...input.scope, actorRole: 'customer' },
      notice: {
        ...input.notice,
        isEmergency: true,
        reason: 'Family emergency',
      },
    };
  const result = await run(f, value);
  expect(publish).toHaveBeenCalledWith(
    f.tx,
    { userId: ids.actor, stayId: ids.stay, noticeId: result.noticeId },
    now,
  );
  expect(f.writes.at(1)?.value).toMatchObject({
    detail: { reason: 'Family emergency', isEmergency: true, shortfallDays: 6 },
  });
});
it('SEC-003: a self notice never grants access to another linked or unlinked resident', async () => {
  for (const userId of [null, ids.user]) {
    const f = fixture({ stay: { userId } });
    await expect(
      run(f, { ...input, scope: { ...input.scope, actorRole: 'customer' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(f.writes).toEqual([]);
  }
});
it('SEC-003: missing actual authorizer fails before hierarchy access', async () => {
  const f = fixture();
  await expect(recordResidentNotice(f.tx, input, now)).rejects.toMatchObject({
    status: 503,
  });
  expect(lockInventoryBranch).not.toHaveBeenCalled();
  expect(f.writes).toEqual([]);
});
it('SEC-003: authorizer rejection propagates before any scoped lookup', async () => {
  const f = fixture();
  await expect(
    recordResidentNotice(f.tx, input, now, async () => {
      throw Error('Session revoked');
    }),
  ).rejects.toThrow('Session revoked');
  expect(lockInventoryBranch).not.toHaveBeenCalled();
});
it('NTF-002: linked notice with no publisher fails before history/state writes', async () => {
  const f = fixture({ stay: { userId: ids.user } });
  await expect(recordResidentNotice(f.tx, input, now, authorize)).rejects.toMatchObject({
    status: 503,
  });
  expect(f.writes).toEqual([]);
});
it('NTF-002 / ACC-004: required publication failure propagates for transaction rollback', async () => {
  const f = fixture({ stay: { userId: ids.user } });
  await expect(
    recordResidentNotice(f.tx, input, now, authorize, async () => {
      throw Error('Required notice failed');
    }),
  ).rejects.toThrow('Required notice failed');
});
it.each([
  { missingStay: true },
  { stay: { id: randomUUID() } },
  { stay: { branchId: randomUUID() } },
  { stay: { version: 0 } },
  { stay: { version: 2 } },
  { stay: { state: 'notice_given' } },
  { stay: { state: 'check_in_ready' } },
  { stay: { state: 'completed' } },
  { stay: { closedAt: now } },
  { stay: { checkedInAt: null } },
  { stay: { checkedInAt: new Date('2028-02-02T00:00:00Z') } },
  { stay: { moveInDate: '2028-02-02' } },
  { missingAgreement: true },
  { agreement: { branchId: randomUUID() } },
  { agreement: { stayId: randomUUID() } },
  { agreement: { id: 'bad' } },
  { agreement: { effectiveFrom: 'bad' } },
  { agreement: { effectiveFrom: '2028-02-02' } },
  { agreement: { termsSnapshot: {} } },
  { agreement: { policyVersionId: randomUUID() } },
  { agreement: { rentAmountPaisa: 1n } },
  { agreement: { depositPaisa: 1n } },
])(
  'SEC-003 / OUT-001: absent, stale, inactive or corrupt scope %# fails without state/history writes',
  async (options) => {
    const f = fixture(options);
    await expect(run(f)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  },
);
it('OUT-001: version cannot overflow the persisted integer', async () => {
  const f = fixture({ stay: { version: 2147483647 } });
  await expect(
    run(f, {
      ...input,
      notice: { ...input.notice, expectedVersion: 2147483647 },
    }),
  ).rejects.toMatchObject({
    code: 'CONFLICT',
    message: 'Stay version exhausted',
  });
  expect(f.writes).toEqual([]);
});
it('SEC-003: archived hierarchy cannot create a new notice', async () => {
  control.archived = 'archived';
  const f = fixture();
  await expect(run(f)).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(f.writes).toEqual([]);
});
it.each([
  { updated: [] },
  { updated: [{ id: randomUUID(), version: 2 }] },
  { updated: [{ id: ids.stay, version: 3 }] },
])('ACC-004: failed optimistic state result %# prevents history and audit', async ({ updated }) => {
  const f = fixture({ updated });
  await expect(run(f)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.writes.map((row) => row.table)).toEqual([stays]);
});
it.each([stayHistory, hostelAuditLog])(
  'AUD-004 / ACC-004: required history/audit failure %# propagates',
  async (fail) => {
    await expect(run(fixture({ fail }))).rejects.toThrow('Required notice write failed');
  },
);
it('OUT-001: submission date uses server Karachi date, not the UTC date', async () => {
  const f = fixture();
  const result = await recordResidentNotice(
    f.tx,
    input,
    new Date('2028-02-01T20:00:00Z'),
    authorize,
  );
  expect(result.plan.submittedOn).toBe('2028-02-02');
  expect(result.plan.shortfallDays).toBe(7);
});
it.each([
  { scope: { ...input.scope, actorRole: 'system' } },
  { notice: { ...input.notice, releaseSeat: true } },
  { scope: { ...input.scope, branchId: 'bad' } },
])('SEC-003: invalid input %# is rejected before authorization', async (value) => {
  await expect(run(fixture(), { ...input, ...value })).rejects.toThrow();
  expect(authorize).not.toHaveBeenCalled();
});
it('SEC-003: invalid clock is rejected before authorization', async () => {
  await expect(
    recordResidentNotice(fixture().tx, input, new Date(Number.NaN), authorize),
  ).rejects.toThrow();
  expect(authorize).not.toHaveBeenCalled();
});
