import { randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { eq } from 'drizzle-orm';
import { users, roomTypes, rooms, seats, type Database } from '@hsm/db';
import { managementFixture } from '@hsm/test-support';
// ACC-001/004: explicit disposable real database records, no HTTP route mocks.
export async function blockPagesData(database: Database) {
  const password = 'Public browser block fixture phrase',
    email = randomUUID() + '@example.test';
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const management = await managementFixture(database, passwordHash, new Date());
  await database
    .update(users)
    .set({ email, emailVerifiedAt: new Date(), passwordHash })
    .where(eq(users.id, management.ownerId));
  const typeId = randomUUID(),
    roomIds = Array.from({ length: 21 }, () => randomUUID()).sort();
  const roomId = roomIds.at(-1);
  if (!roomId) throw new Error('Browser block room missing');
  const bedIds = Array.from({ length: 21 }, () => randomUUID()).sort(),
    bedId = bedIds.at(-1);
  if (!bedId) throw new Error('Browser block bed missing');
  await database.insert(roomTypes).values({
    id: typeId,
    branchId: management.branchA,
    name: 'Paged browser block type',
    inventoryMode: 'both',
    capacity: 21,
    bedMonthlyRentPaisa: 1800001n,
    roomMonthlyRentPaisa: 3200000n,
    depositPaisa: 0n,
  });
  await database.insert(rooms).values(
    roomIds.map((id, index) => ({
      id,
      branchId: management.branchA,
      roomTypeId: typeId,
      label: 'Block ' + String(index + 1),
      status: 'active' as const,
    })),
  );
  await database.insert(seats).values(
    bedIds.map((id, index) => ({
      id,
      branchId: management.branchA,
      roomId,
      label: 'Bed ' + String(index + 1),
      ordinal: index + 1,
      status: 'active' as const,
    })),
  );
  const start = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    end = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  return { ...management, email, password, roomId, bedId, start, end };
}
