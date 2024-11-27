import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  brands,
  branches,
  notificationOutbox,
  organizations,
  sweepVisitFollowUps,
  users,
  visitHistory,
  visitRequests,
} from '@hsm/db';
import type { Database } from '@hsm/db';
export async function completedVisit(db: Database) {
  const now = new Date(),
    userId = randomUUID(),
    ownerId = randomUUID(),
    organizationId = randomUUID(),
    brandId = randomUUID(),
    branchId = randomUUID(),
    visitId = randomUUID(),
    historyId = randomUUID();
  await db.insert(users).values([
    { id: userId, fullName: 'Visit customer' },
    { id: ownerId, fullName: 'Visit owner' },
  ]);
  await db
    .insert(organizations)
    .values({ id: organizationId, ownerUserId: ownerId, name: 'Visit fixture' });
  await db.insert(brands).values({ id: brandId, organizationId, name: 'Visit fixture' });
  await db
    .insert(branches)
    .values({ id: branchId, brandId, organizationId, name: 'Visit branch', slug: branchId });
  const requestedStart = new Date(now.getTime() - 7200000);
  await db.insert(visitRequests).values({
    id: visitId,
    branchId,
    customerUserId: userId,
    status: 'completed',
    requestedStart,
    decidedByUserId: ownerId,
    createdAt: requestedStart,
    updatedAt: now,
  });
  await db.insert(visitHistory).values({
    id: historyId,
    branchId,
    visitId,
    actorUserId: ownerId,
    action: 'complete',
    status: 'completed',
    requestedStart,
    createdAt: now,
  });
  const results = await Promise.all([sweepVisitFollowUps(db, now), sweepVisitFollowUps(db, now)]);
  if (results.reduce((total, count) => total + count, 0) !== 1)
    throw new Error('Visit fixture prompt count');
  const [job] = await db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'visit.lifecycle'),
        sql`${notificationOutbox.payload}->>'visitId' = ${visitId}`,
        sql`${notificationOutbox.payload}->>'event' = 'visit.follow_up'`,
      ),
    );
  if (!job) throw new Error('Missing visit fixture job');
  return { userId, ownerId, branchId, visitId, historyId, now, job };
}
