import { randomInt, randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import {
  users,
  customerProfiles,
  branches,
  roomTypes,
  rooms,
  seats,
  bookingPolicies,
  type Database,
} from '@hsm/db';
import { managementFixture, publishInventoryPhotos } from '@hsm/test-support';
// Explicit disposable Testcontainers data, never production defaults or mocked responses.
export async function checkoutData(database: Database, bucket: string) {
  const now = new Date(),
    password = 'Public browser checkout fixture phrase';
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const management = await managementFixture(database, passwordHash, now),
    customerId = randomUUID(),
    email = randomUUID() + '@example.test',
    roomTypeId = randomUUID(),
    roomId = randomUUID(),
    seatId = randomUUID();
  await database.insert(users).values({
    id: customerId,
    fullName: 'Browser booking Customer',
    email,
    emailVerifiedAt: now,
    passwordHash,
    phoneE164: '+923' + randomInt(0, 1000000000).toString().padStart(9, '0'),
    gender: 'male',
  });
  await database
    .insert(customerProfiles)
    .values({ userId: customerId, age: 20, profileCompletedAt: now });
  await database
    .update(branches)
    .set({ verificationStatus: 'approved', firstApprovedAt: now })
    .where(eq(branches.id, management.branchA));
  // Retain prior fixture versions rather than deleting history in the shared worker DB.
  await database
    .update(bookingPolicies)
    .set({ isCurrent: false })
    .where(
      and(
        eq(bookingPolicies.isCurrent, true),
        isNull(bookingPolicies.brandId),
        isNull(bookingPolicies.branchId),
      ),
    );
  await database.insert(bookingPolicies).values({
    id: randomUUID(),
    isCurrent: true,
    createdByUserId: management.ownerId,
    policy: {
      bookingMode: 'request',
      holdSeconds: 600,
      requestExpirySeconds: 3600,
      requestReservesInventory: true,
      minimumStayDays: 1,
      maximumStayDays: 365,
      minimumAdvanceDays: 0,
      maximumAdvanceDays: 365,
      customerSelectsInventory: true,
      cancellationAllowed: true,
      cancellationCutoffHours: 0,
      allowedStayUnits: ['day', 'week', 'month'],
      requiredDocuments: [],
      allowEvidenceReuse: true,
      documentReviewRequired: false,
    },
    platformLimits: {
      maximumHoldSeconds: 3600,
      maximumActiveHolds: 3,
      maximumRequestExpirySeconds: 86400,
      maximumAdvanceDays: 365,
      maximumFiniteStayDays: 730,
    },
  });
  await database.insert(roomTypes).values({
    id: roomTypeId,
    branchId: management.branchA,
    name: 'Browser booking room type',
    inventoryMode: 'both',
    capacity: 1,
    bedMonthlyRentPaisa: 1800000n,
    roomMonthlyRentPaisa: 3200000n,
    depositPaisa: 0n,
  });
  await database.insert(rooms).values({
    id: roomId,
    branchId: management.branchA,
    roomTypeId,
    label: '501',
    status: 'active',
  });
  await database.insert(seats).values({
    id: seatId,
    branchId: management.branchA,
    roomId,
    ordinal: 1,
    label: 'A',
    status: 'active',
  });
  // ROOM-003: public selectability requires published room and bed photos.
  await publishInventoryPhotos(database, {
    bucket,
    ownerId: management.ownerId,
    branchId: management.branchA,
    roomId,
    seatIds: [seatId],
    now,
  });
  const moveInDate = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10),
    moveOutDate = new Date(now.getTime() + 37 * 86400000).toISOString().slice(0, 10);
  return {
    ownerId: management.ownerId,
    customerId,
    email,
    password,
    branchId: management.branchA,
    roomId,
    seatId,
    moveInDate,
    moveOutDate,
  };
}
