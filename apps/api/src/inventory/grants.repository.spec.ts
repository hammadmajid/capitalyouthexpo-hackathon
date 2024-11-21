import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { managerAssignments, managerInventoryGrants } from '@hsm/db';
import { AuditWriter } from '../audit/writer.js';
import { lockInventoryScope } from './scope.js';
import { InventoryGrantRepository } from './grants.repository.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID(),
  assignmentId = randomUUID();
const now = new Date('2026-10-14T12:00:00Z'),
  organizationId = randomUUID();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    ownerId: actor.userId,
    organizationId,
    brandId: randomUUID(),
    actorRole: 'owner',
  });
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  const record = vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  return { ...store, record, repository: new InventoryGrantRepository(audit, () => now) };
}
it('ACC-004: assignment permissions require Owner-only scope and exact assignment identity', async () => {
  const store = fixture();
  store.enqueue(managerAssignments, [{ id: assignmentId }]);
  expect(await store.repository.authorize(store.transaction, actor, branchId, assignmentId)).toBe(
    true,
  );
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    branchId,
    undefined,
    true,
  );
});
it('ACC-004: absent or foreign assignment cannot acquire permissions', async () => {
  const store = fixture();
  store.enqueue(managerAssignments, []);
  await expect(
    store.repository.authorize(store.transaction, actor, branchId, assignmentId),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toHaveLength(0);
});
it('ACC-004: replacing explicit grants retains a scoped before/after audit', async () => {
  const store = fixture();
  store.enqueue(managerInventoryGrants, [{ permission: 'inventory_edit' }]);
  expect(
    await store.repository.save(store.transaction, actor, branchId, assignmentId, ['pricing_edit']),
  ).toMatchObject({ id: assignmentId, branchId, kind: 'manager_grants' });
  expect(store.writes.find((row) => row.table === managerInventoryGrants)?.value).toEqual([
    { assignmentId, permission: 'pricing_edit', grantedAt: now },
  ]);
  expect(store.record).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({
      branchId,
      before: { permissions: ['inventory_edit'] },
      after: { permissions: ['pricing_edit'] },
    }),
  );
});
it('ACC-004: revoking every extra grant does not invent a replacement privilege', async () => {
  const store = fixture();
  store.enqueue(managerInventoryGrants, []);
  await store.repository.save(store.transaction, actor, branchId, assignmentId, []);
  expect(store.writes).toHaveLength(0);
  expect(store.record).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({ after: { permissions: [] } }),
  );
});
