import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  admitManualResident,
  users,
  organizations,
  brands,
  branches,
  roomTypes,
  rooms,
  seats,
  residents,
  billingPolicies,
  notificationOutbox,
  type Database,
} from '@hsm/db';
import {
  residentLifecycleLeaseSchema,
  NotificationRepository,
  NotificationService,
} from '../src/index.js';
async function inventory(db: Database) {
  const ids = {
    owner: randomUUID(),
    user: randomUUID(),
    organization: randomUUID(),
    brand: randomUUID(),
    branch: randomUUID(),
    type: randomUUID(),
    room: randomUUID(),
    seat: randomUUID(),
  };
  await db.insert(users).values([
    { id: ids.owner, fullName: 'Lifecycle Owner fixture' },
    { id: ids.user, fullName: 'Private resident fixture' },
  ]);
  await db
    .insert(organizations)
    .values({ id: ids.organization, ownerUserId: ids.owner, name: 'Lifecycle organization' });
  await db
    .insert(brands)
    .values({ id: ids.brand, organizationId: ids.organization, name: 'Lifecycle hostel' });
  await db.insert(branches).values({
    id: ids.branch,
    organizationId: ids.organization,
    brandId: ids.brand,
    name: 'Lifecycle branch',
    slug: ids.branch,
  });
  await db.insert(roomTypes).values({
    id: ids.type,
    branchId: ids.branch,
    name: 'Lifecycle type',
    capacity: 1,
    inventoryMode: 'per_bed',
    bedMonthlyRentPaisa: 1800001n,
    depositPaisa: 1000001n,
  });
  await db.insert(rooms).values({
    id: ids.room,
    branchId: ids.branch,
    roomTypeId: ids.type,
    label: '101',
    status: 'active',
  });
  await db.insert(seats).values({
    id: ids.seat,
    branchId: ids.branch,
    roomId: ids.room,
    ordinal: 1,
    label: 'A',
    status: 'active',
  });
  return ids;
}
async function policy(db: Database, ids: Awaited<ReturnType<typeof inventory>>) {
  const id = randomUUID();
  const terms = {
    policyVersionId: id,
    currency: 'PKR',
    fees: [],
    catalog: [],
    rentAmountPaisa: 1800001,
    depositPaisa: 1000001,
    policy: {
      cycle: { kind: 'calendar_month', dueDay: 5 },
      proration: { kind: 'full_period' },
      graceDays: 0,
      lateCharge: { kind: 'disabled' },
      noticeDays: 15,
      earlyCheckout: { kind: 'manual' },
      allowOpenEnded: false,
      customCharges: 'disabled',
    },
  };
  await db.insert(billingPolicies).values({
    id,
    branchId: ids.branch,
    policy: terms.policy,
    isCurrent: true,
    createdByUserId: ids.owner,
  });
  return terms;
}
const authority: NonNullable<Parameters<typeof admitManualResident>[3]> = async (tx, input) => {
  const ids = [
    ...new Set([
      input.scope.actorUserId,
      ...(input.expectedUserId === null ? [] : [input.expectedUserId]),
    ]),
  ].sort();
  const participants = await tx
    .select({ id: users.id, status: users.accountStatus })
    .from(users)
    .where(inArray(users.id, ids))
    .orderBy(users.id)
    .for('update');
  const [owner] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, input.scope.organizationId),
        eq(organizations.ownerUserId, input.scope.actorUserId),
      ),
    )
    .for('update');
  if (
    participants.length !== ids.length ||
    participants.some((row) => row.status !== 'active') ||
    !owner ||
    input.scope.actorRole !== 'owner'
  )
    throw new Error('Lifecycle fixture authority unavailable');
};
// Full real source transaction fixture, not HTTP/session/link-consent acceptance.
export async function residentPublicationScope(db: Database, linked: boolean) {
  const ids = await inventory(db),
    terms = await policy(db, ids),
    now = new Date();
  const calendar = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = calendar.format(now),
    expectedLeaveDate = calendar.format(new Date(now.getTime() + 32 * 86_400_000));
  let resident:
    { kind: 'new'; profile: { displayName: string } } | { kind: 'existing'; residentId: string } = {
    kind: 'new',
    profile: { displayName: 'Offline lifecycle resident' },
  };
  if (linked) {
    const id = randomUUID();
    await db.insert(residents).values({
      id,
      branchId: ids.branch,
      userId: ids.user,
      displayName: 'Private resident fixture',
      createdByUserId: ids.owner,
    });
    resident = { kind: 'existing', residentId: id };
  }
  const result = await db.transaction((tx) =>
    admitManualResident(
      tx,
      {
        scope: {
          organizationId: ids.organization,
          branchId: ids.branch,
          actorUserId: ids.owner,
          actorRole: 'owner',
        },
        manual: {
          resident,
          target: { kind: 'bed', roomId: ids.room, bedId: ids.seat },
          period: { moveInDate: day, expectedLeaveDate },
          terms,
        },
        expectedUserId: linked ? ids.user : null,
        initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
      },
      now,
      authority,
    ),
  );
  return { ...ids, ...result, now };
}
export async function claimResidentPublication(db: Database, stayId: string, now: Date) {
  const [row] = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'resident.lifecycle'),
        sql`${notificationOutbox.payload}->>'stayId' = ${stayId}`,
      ),
    );
  if (!row) throw Error('Resident event fixture missing');
  const [claimed] = await db
    .update(notificationOutbox)
    .set({ leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + 60000), attempts: 1 })
    .where(eq(notificationOutbox.id, row.id))
    .returning();
  if (!claimed) throw Error('Resident lease fixture missing');
  return residentLifecycleLeaseSchema.parse({
    id: claimed.id,
    eventType: claimed.eventType,
    channel: claimed.channel,
    recipientUserId: claimed.recipientUserId,
    payload: claimed.payload,
    leaseToken: claimed.leaseToken,
    leaseExpiresAt: claimed.leaseExpiresAt,
  });
}
export function residentPublicationService(db: Database, now: Date) {
  return new NotificationService(new NotificationRepository(db, () => now), () => now);
}
export function residentChildJobs(db: Database, historyId: string) {
  return db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'notification.create'),
        sql`${notificationOutbox.payload}->>'operationId' = ${historyId}`,
      ),
    )
    .orderBy(notificationOutbox.recipientUserId);
}
export async function deliverResidentChild(
  db: Database,
  row: typeof notificationOutbox.$inferSelect,
  now: Date,
) {
  const [lease] = await db
    .update(notificationOutbox)
    .set({ leaseToken: randomUUID(), leaseExpiresAt: new Date(now.getTime() + 60000), attempts: 1 })
    .where(eq(notificationOutbox.id, row.id))
    .returning();
  if (!lease) throw Error('Resident child lease missing');
  const service = residentPublicationService(db, now);
  await Promise.all([service.deliver(lease), service.deliver(lease)]);
}
