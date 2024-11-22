import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { residents, users } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { lockActor } from '../auth/actor-lock.js';
import { lockParticipants } from '../management/identity-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import {
  lockManualAdmissionAuthority,
  manualAdmissionCommandContext,
} from './manual-admission.scope.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  paymentActor as actor,
  paymentIds as ids,
  paymentNow as now,
  paymentAuthority as authority,
} from '../../test/unit/stay-payment.fixture.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../management/identity-lock.js', () => ({ lockParticipants: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
const reference = { kind: 'existing' as const, residentId: randomUUID() };
const resident = {
  id: reference.residentId,
  branchId: ids.branch,
  userId: ids.customer,
  archivedAt: null,
};
const offline = { kind: 'new' as const, profile: { displayName: 'Offline' } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue(authority);
});
function fixture(
  row: unknown = resident,
  account: unknown = { id: ids.customer, status: 'active' },
) {
  const f = queryFixture();
  f.enqueue(residents, row === null ? [] : [row]);
  f.enqueue(users, account === null ? [] : [account]);
  return f;
}
it('STAY-001 / CHG-010: live stay/rent/finance authority precedes exact branch relationship lock', async () => {
  const f = fixture();
  expect(
    await lockManualAdmissionAuthority(f.transaction, actor, ids.branch, reference, () => now),
  ).toEqual({ ...authority, userId: ids.customer });
  expect(vi.mocked(lockInventoryScope).mock.calls.map((call) => call[3])).toEqual([
    'stay_manage',
    'rent_manage',
    'finance_view',
  ]);
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(f.locks).toEqual([{ table: residents, mode: 'update' }]);
  expect(f.predicates.find((item) => item.table === users)).toBeDefined();
});
it.each(['stay_manage', 'rent_manage', 'finance_view'] as const)(
  'ACC-002: missing %s denies before private relationship lookup',
  async (permission) => {
    vi.mocked(lockInventoryScope).mockImplementation(async (_tx, _actor, _branch, grant) => {
      if (grant === permission) throw new DomainError('FORBIDDEN', 403, 'Permission unavailable');
      return authority;
    });
    const f = fixture();
    await expect(
      lockManualAdmissionAuthority(f.transaction, actor, ids.branch, reference, () => now),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.predicates).toEqual([]);
  },
);
it.each([1, 2])(
  'SEC-003: revoked session on authority check %s fails before relationship access',
  async (check) => {
    const denial = new DomainError('SESSION_REVOKED', 401, 'Session unavailable');
    vi.mocked(lockActor).mockImplementation(async () => {
      if (vi.mocked(lockActor).mock.calls.length === check) throw denial;
    });
    const f = fixture();
    await expect(
      lockManualAdmissionAuthority(f.transaction, actor, ids.branch, reference, () => now),
    ).rejects.toBe(denial);
    expect(f.predicates).toEqual([]);
  },
);
it('RES-003: new offline admission never searches contacts or creates a login', async () => {
  const f = fixture();
  expect(
    (await lockManualAdmissionAuthority(f.transaction, actor, ids.branch, offline, () => now, null))
      .userId,
  ).toBeNull();
  expect(f.predicates).toEqual([]);
  expect(f.writes).toEqual([]);
});
it.each([
  { row: null, code: 'NOT_FOUND' },
  { row: { ...resident, id: randomUUID() }, code: 'INTERNAL' },
  { row: { ...resident, branchId: randomUUID() }, code: 'INTERNAL' },
  { row: { ...resident, userId: 'invalid' }, code: 'INTERNAL' },
  { row: { ...resident, archivedAt: now }, code: 'CONFLICT' },
])(
  'RES-003 / SEC-003: missing, corrupt or archived existing relationship %# fails closed',
  async ({ row, code }) => {
    const f = fixture(row);
    await expect(
      lockManualAdmissionAuthority(f.transaction, actor, ids.branch, reference, () => now),
    ).rejects.toMatchObject({ code });
    expect(f.predicates.filter((item) => item.table === users)).toEqual([]);
  },
);
it('SEC-003: changed preflight link rejects before looking up the new private account', async () => {
  const f = fixture();
  await expect(
    lockManualAdmissionAuthority(f.transaction, actor, ids.branch, reference, () => now, null),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.predicates.filter((item) => item.table === users)).toEqual([]);
});
it.each([
  { account: null, code: 'INTERNAL' },
  { account: { id: randomUUID(), status: 'active' }, code: 'INTERNAL' },
  { account: { id: ids.customer, status: 'suspended' }, code: 'ACCOUNT_SUSPENDED' },
])(
  'SEC-003: missing, foreign or suspended linked account %# is not admitted',
  async ({ account, code }) => {
    const f = fixture(resident, account);
    await expect(
      lockManualAdmissionAuthority(
        f.transaction,
        actor,
        ids.branch,
        reference,
        () => now,
        ids.customer,
      ),
    ).rejects.toMatchObject({ code });
  },
);
it('RES-003: existing offline relationship retains its null link', async () => {
  const f = fixture({ ...resident, userId: null });
  expect(
    (
      await lockManualAdmissionAuthority(
        f.transaction,
        actor,
        ids.branch,
        reference,
        () => now,
        null,
      )
    ).userId,
  ).toBeNull();
  expect(f.predicates.filter((item) => item.table === users)).toEqual([]);
});
it.each([ids.customer, null])(
  'ACC-004: linked participant %s uses global account order before idempotent mutation',
  async (userId) => {
    const f = fixture({ ...resident, userId });
    const context = await manualAdmissionCommandContext(
      f.database,
      actor,
      ids.branch,
      reference,
      () => now,
    );
    expect(context.userId).toBe(userId);
    vi.mocked(lockActor).mockClear();
    await context.store.transaction(actor, now, async () => undefined);
    if (userId === null) {
      expect(lockActor).toHaveBeenCalledWith(f.transaction, actor, expect.any(Function));
      expect(lockParticipants).not.toHaveBeenCalled();
    } else {
      expect(lockParticipants).toHaveBeenCalledWith(
        f.transaction,
        actor,
        userId,
        expect.any(Function),
      );
      expect(lockActor).not.toHaveBeenCalled();
    }
  },
);
