import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import pino from 'pino';
import {
  areas,
  brands,
  branches,
  cities,
  lockInventoryBranch,
  notificationOutbox,
  notifications,
  organizations,
  reconcileWaitlistAvailability,
  rooms,
  roomTypes,
  seats,
  users,
  waitlistEntries,
} from '@hsm/db';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
import { OutboxRepository } from '../src/repository.js';
import { startWorker } from '../src/runtime.js';
import { workerFixture } from './fixture.js';
let f: Awaited<ReturnType<typeof workerFixture>>;
beforeAll(async () => {
  f = await workerFixture();
});
afterAll(async () => {
  await f?.close();
});
async function vacancy() {
  const db = f.database.db,
    now = new Date();
  const userId = randomUUID(),
    organizationId = randomUUID(),
    brandId = randomUUID(),
    cityId = randomUUID(),
    areaId = randomUUID(),
    branchId = randomUUID(),
    roomTypeId = randomUUID(),
    roomId = randomUUID();
  await db.insert(users).values({ id: userId, fullName: 'Waiting customer' });
  await db
    .insert(organizations)
    .values({ id: organizationId, ownerUserId: userId, name: 'Hostel' });
  await db.insert(brands).values({ id: brandId, organizationId, name: 'Hostel' });
  await db.insert(cities).values({ id: cityId, name: 'Islamabad fixture', slug: cityId });
  await db
    .insert(areas)
    .values({ id: areaId, cityId, name: 'Fixture area', slug: areaId, level: 'area' });
  await db.insert(branches).values({
    id: branchId,
    organizationId,
    brandId,
    name: 'Hostel branch',
    slug: branchId,
    category: 'boys',
    cityId,
    areaId,
    addressLine: 'Fixture address',
    location: 'SRID=4326;POINT(73.0479 33.6844)',
    verificationStatus: 'approved',
  });
  await db.insert(roomTypes).values({
    id: roomTypeId,
    branchId,
    name: 'One bed',
    capacity: 1,
    inventoryMode: 'per_bed',
    bedMonthlyRentPaisa: 1000000n,
    depositPaisa: 0n,
  });
  await db
    .insert(rooms)
    .values({ id: roomId, branchId, roomTypeId, label: '101', status: 'inactive' });
  await db
    .insert(seats)
    .values({ id: randomUUID(), branchId, roomId, ordinal: 1, label: 'A', status: 'active' });
  await db
    .insert(waitlistEntries)
    .values({ id: randomUUID(), branchId, customerUserId: userId, joinedAt: now });
  await db.transaction(async (tx) => {
    await lockInventoryBranch(tx, branchId);
    await reconcileWaitlistAvailability(tx, branchId, now);
  });
  await db.update(rooms).set({ status: 'active' }).where(eq(rooms.id, roomId));
  await db.transaction(async (tx) => {
    await lockInventoryBranch(tx, branchId);
    await reconcileWaitlistAvailability(tx, branchId, new Date());
  });
  const [job] = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.eventType, 'waitlist.lifecycle'));
  if (!job) throw new Error('Vacancy source job absent');
  return { userId, job };
}
it('WAIT-001 / NTF-002: real Redis worker restart recovers a failed vacancy fanout and creates one source-bound inbox alert', async () => {
  const item = await vacancy(),
    db = f.database.db;
  const repository = new OutboxRepository(db),
    notices = new NotificationService(new NotificationRepository(db));
  const start = (fail: boolean) =>
    startWorker(
      repository,
      {
        send: async () => {
          throw new Error('Unexpected external email');
        },
      },
      randomBytes(32),
      f.redisUrl,
      pino({ level: 'silent' }),
      undefined,
      {
        deliver: async (row) => {
          if (fail && row.eventType === 'waitlist.lifecycle')
            throw new Error('Recoverable fixture failure');
          await notices.deliver(row);
        },
      },
      undefined,
      undefined,
      undefined,
      { sweep: async () => 0 },
    );
  let worker = await start(true);
  try {
    await expect
      .poll(
        async () => {
          const [row] = await db
            .select()
            .from(notificationOutbox)
            .where(eq(notificationOutbox.id, item.job.id));
          return row?.status;
        },
        { timeout: 15000, interval: 100 },
      )
      .toBe('failed');
    await worker.close();
    worker = await start(false);
    await expect
      .poll(
        async () =>
          (
            await db
              .select()
              .from(notifications)
              .where(
                and(
                  eq(notifications.userId, item.userId),
                  eq(notifications.type, 'waitlist.vacancy'),
                ),
              )
          ).length,
        { timeout: 15000, interval: 100 },
      )
      .toBe(1);
    const [source] = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, item.job.id));
    expect(source).toMatchObject({
      status: 'sent',
      attempts: 2,
      leaseToken: null,
      lastError: null,
    });
    const [notice] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, item.userId));
    expect(notice?.body).toContain('does not reserve a bed');
    expect(notice?.data).toEqual({});
  } finally {
    await worker.close();
  }
});
