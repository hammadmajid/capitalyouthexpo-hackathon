import { beforeEach, expect, it, vi } from 'vitest';
import { hostelAuditLog, residents } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { residentService } from './residents.service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
const branch = '10000000-0000-4000-8000-000000000001',
  org = '10000000-0000-4000-8000-000000000009',
  resident = '20000000-0000-4000-8000-000000000001';
const actor = { userId: '40000000-0000-4000-8000-000000000001' } as never;
const now = new Date('2026-11-13T10:00:00Z');
const input = { displayName: ' Ali Raza ', phone: '+923001234567', email: 'Ali@Example.com' };
const row = {
  id: resident,
  branchId: branch,
  userId: null,
  archivedAt: null,
  displayName: 'Ali',
  phone: null,
  email: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId: org,
    brandId: org,
    ownerId: org,
    actorRole: 'manager',
  });
});
it('RES-006 / ACC-006: locks the row, saves the correction and audits before and after', async () => {
  const store = queryFixture();
  store.enqueue(residents, [row]);
  const saved = await residentService(store.database, () => now).updateContact(
    actor,
    branch,
    resident,
    input,
  );
  expect(saved).toEqual({
    id: resident,
    branchId: branch,
    displayName: 'Ali Raza',
    phone: '+923001234567',
    email: 'ali@example.com',
  });
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, branch, 'stay_manage');
  expect(store.locks).toContainEqual({ table: residents, mode: 'update' });
  expect(store.writes).toContainEqual(
    expect.objectContaining({
      table: residents,
      value: expect.objectContaining({ displayName: 'Ali Raza', updatedAt: now }),
    }),
  );
  expect(store.writes).toContainEqual(
    expect.objectContaining({
      table: hostelAuditLog,
      value: expect.objectContaining({
        action: 'resident.contact.updated',
        actorRole: 'manager',
        organizationId: org,
        branchId: branch,
        targetId: resident,
        before: { displayName: 'Ali', phone: null, email: null },
      }),
    }),
  );
});
it.each([
  ['linked', { ...row, userId: resident }, 409],
  ['archived', { ...row, archivedAt: now }, 409],
])('CHG-009: a %s resident is not changed by staff', async (_name, value, status) => {
  const store = queryFixture();
  store.enqueue(residents, [value]);
  await expect(
    residentService(store.database, () => now).updateContact(actor, branch, resident, input),
  ).rejects.toMatchObject({ status });
  expect(store.writes).toHaveLength(0);
});
it('SEC-001: a resident outside this branch is unavailable', async () => {
  const store = queryFixture();
  await expect(
    residentService(store.database, () => now).updateContact(actor, branch, resident, input),
  ).rejects.toMatchObject({ status: 404 });
  expect(store.writes).toHaveLength(0);
});
it('SEC-001: missing stay_manage is refused before any read', async () => {
  vi.mocked(lockInventoryScope).mockRejectedValue(Object.assign(new Error('no'), { status: 403 }));
  const store = queryFixture();
  store.enqueue(residents, [row]);
  await expect(
    residentService(store.database, () => now).updateContact(actor, branch, resident, input),
  ).rejects.toMatchObject({ status: 403 });
  expect(store.writes).toHaveLength(0);
});
it('RES-006: invalid input never reaches the database', async () => {
  const store = queryFixture();
  await expect(
    residentService(store.database, () => now).updateContact(actor, branch, resident, {
      ...input,
      phone: '03001234567',
    }),
  ).rejects.toThrow();
  expect(store.writes).toHaveLength(0);
});
