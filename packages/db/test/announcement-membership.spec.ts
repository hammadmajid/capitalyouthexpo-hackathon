import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { branches, cities, deliverAnnouncement, managerAssignments, users } from '../src/index.js';
import { inventoryHarness, type InventoryFixture } from './inventory.fixture.js';
import {
  announcementFixture,
  announcementNotices,
  announcementNow as now,
} from './announcement-delivery.fixture.js';
const h = inventoryHarness();
let a: InventoryFixture,
  b: InventoryFixture,
  secondBranch: string,
  ids: string[],
  foreign: string,
  cityId: string;
beforeAll(async () => {
  await h.start();
  a = await h.scope();
  b = await h.scope();
  secondBranch = randomUUID();
  cityId = randomUUID();
  foreign = randomUUID();
  const db = h.database();
  await db.insert(cities).values({ id: cityId, name: 'Announcement fixture city', slug: cityId });
  await db.update(branches).set({ cityId }).where(eq(branches.id, a.branchId));
  await db.insert(branches).values({
    id: secondBranch,
    organizationId: a.organizationId,
    brandId: a.brandId,
    cityId,
    name: 'Duplicate audience branch',
    slug: secondBranch,
  });
  ids = Array.from({ length: 5001 }, () => randomUUID());
  await db.insert(users).values({ id: foreign, fullName: 'Foreign branch Manager' });
  for (let offset = 0; offset < ids.length; offset += 500) {
    const page = ids.slice(offset, offset + 500);
    await db
      .insert(users)
      .values(page.map((id) => ({ id, fullName: 'Announcement Manager fixture' })));
    await db.insert(managerAssignments).values(
      page.flatMap((userId) =>
        [a.branchId, secondBranch].map((branchId) => ({
          userId,
          branchId,
          status: branchId === a.branchId ? ('active' as const) : ('deactivated' as const),
          appointedByUserId: a.ownerId,
          activatedAt: now,
        })),
      ),
    );
  }
  await db.insert(managerAssignments).values([
    {
      userId: a.ownerId,
      branchId: a.branchId,
      status: 'active',
      appointedByUserId: a.ownerId,
      activatedAt: now,
    },
    {
      userId: foreign,
      branchId: b.branchId,
      status: 'active',
      appointedByUserId: b.ownerId,
      activatedAt: now,
    },
  ]);
});
afterAll(() => h.close());
it.each(['selected_branches', 'city', 'all_managers'] as const)(
  'AUD-008 / ADM-010: %s resolves unique users after 10000 current/historical memberships without losing later users',
  async (audience) => {
    const f = await announcementFixture(h.database(), a.ownerId, {
      audience,
      ...(audience === 'selected_branches' ? { branchIds: [a.branchId, secondBranch] } : {}),
      ...(audience === 'city' ? { cityId } : {}),
    });
    expect(await deliverAnnouncement(h.database(), f.job, () => now)).toBe(true);
    const expected = [...ids, a.ownerId, ...(audience === 'all_managers' ? [foreign] : [])];
    const rows = await announcementNotices(h.database(), f.id);
    expect(rows).toHaveLength(expected.length);
    expect(new Set(rows.map((row) => row.userId))).toEqual(new Set(expected));
  },
);
it('AUD-008 / ACC-002: live suspended assignments and archived selected branches are excluded', async () => {
  await h
    .database()
    .update(managerAssignments)
    .set({ status: 'suspended' })
    .where(
      and(
        inArray(managerAssignments.branchId, [a.branchId, secondBranch]),
        eq(managerAssignments.status, 'active'),
      ),
    );
  await h.database().update(branches).set({ archivedAt: now }).where(eq(branches.id, secondBranch));
  const f = await announcementFixture(h.database(), a.ownerId, {
    audience: 'selected_branches',
    branchIds: [a.branchId, secondBranch],
  });
  expect(await deliverAnnouncement(h.database(), f.job, () => now)).toBe(true);
  expect(await announcementNotices(h.database(), f.id)).toEqual([{ userId: a.ownerId }]);
});

it('AUD-008 / ACC-002: duplicate live Manager assignments remain rejected by the existing database constraint', async () => {
  await expect(
    h.database().insert(managerAssignments).values({
      userId: foreign,
      branchId: a.branchId,
      status: 'active',
      appointedByUserId: a.ownerId,
      activatedAt: now,
    }),
  ).rejects.toMatchObject({ cause: { code: '23505' } });
});
