import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stays, readResidentReceipt } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  receiptActor as actor,
  receiptIds as ids,
  receiptStay,
  receiptNow as now,
  receiptDetail,
} from '../../test/unit/stay-receipt.fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { StayReceiptRepository } from './receipt.repository.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentReceipt: vi.fn(),
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readResidentReceipt).mockResolvedValue(receiptDetail);
});
function call(repository: StayReceiptRepository, kind: 'staff' | 'customer') {
  return kind === 'staff'
    ? repository.staffDetail(actor, ids.branch, ids.stay, ids.receipt)
    : repository.customerDetail(actor, ids.stay, ids.receipt);
}
it.each(['staff', 'customer'] as const)(
  'FIN-001 / SEC-003: %s reads bind exact Stay and server-derived immutable receipt facts in one transaction',
  async (kind) => {
    const f = queryFixture();
    f.enqueue(stays, [receiptStay]);
    const repo = new StayReceiptRepository(f.database, () => now);
    expect(await call(repo, kind)).toEqual(receiptDetail);
    expect(readResidentReceipt).toHaveBeenCalledWith(f.transaction, {
      branchId: ids.branch,
      stayId: ids.stay,
      receiptId: ids.receipt,
    });
    expect(f.locks).toContainEqual({ table: stays, mode: 'share' });
    const predicate = f.predicates[0];
    if (!predicate) throw new Error('Stay scope missing');
    expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([
      ids.stay,
      kind === 'staff' ? ids.branch : actor.userId,
    ]);
    if (kind === 'staff') {
      expect(lockInventoryScope).toHaveBeenCalledWith(
        f.transaction,
        actor,
        ids.branch,
        'finance_view',
      );
      expect(lockActor).toHaveBeenCalledTimes(2);
    } else {
      expect(lockInventoryScope).not.toHaveBeenCalled();
      expect(lockActor).toHaveBeenCalledTimes(1);
    }
    expect(f.writes).toEqual([]);
  },
);
it.each(['staff', 'customer'] as const)(
  'SEC-003: missing exact %s Stay prevents all financial access',
  async (kind) => {
    const repo = new StayReceiptRepository(queryFixture().database);
    await expect(call(repo, kind)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(readResidentReceipt).not.toHaveBeenCalled();
  },
);
it.each([
  { kind: 'staff' as const, patch: { id: randomUUID() } },
  { kind: 'staff' as const, patch: { branchId: randomUUID() } },
  { kind: 'customer' as const, patch: { id: randomUUID() } },
  { kind: 'customer' as const, patch: { userId: randomUUID() } },
  { kind: 'customer' as const, patch: { userId: null } },
])(
  'SEC-003: corrupt or unlinked producer scope %# fails closed before money queries',
  async ({ kind, patch }) => {
    const f = queryFixture();
    f.enqueue(stays, [{ ...receiptStay, ...patch }]);
    const repo = new StayReceiptRepository(f.database);
    await expect(call(repo, kind)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(readResidentReceipt).not.toHaveBeenCalled();
  },
);
it('SEC-003: account/session revocation prevents branch and financial reads', async () => {
  vi.mocked(lockActor).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Account unavailable'));
  const f = queryFixture();
  await expect(call(new StayReceiptRepository(f.database), 'staff')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(lockInventoryScope).not.toHaveBeenCalled();
  expect(f.predicates).toEqual([]);
  expect(readResidentReceipt).not.toHaveBeenCalled();
});
it('ACC-002: denied finance_view stops before Stay or receipt access', async () => {
  vi.mocked(lockInventoryScope).mockRejectedValue(
    new DomainError('FORBIDDEN', 403, 'Management permission required'),
  );
  const f = queryFixture();
  await expect(call(new StayReceiptRepository(f.database), 'staff')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(f.predicates).toEqual([]);
  expect(readResidentReceipt).not.toHaveBeenCalled();
});
it('SEC-003: scoped financial reader failures propagate without fallback balances', async () => {
  const f = queryFixture();
  f.enqueue(stays, [receiptStay]);
  vi.mocked(readResidentReceipt).mockRejectedValue(
    new DomainError('NOT_FOUND', 404, 'Invoice unavailable'),
  );
  await expect(call(new StayReceiptRepository(f.database), 'customer')).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
