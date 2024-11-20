import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { createDatabase } from '../src/index.js';
import {
  customerProfiles,
  files,
  ownerProfiles,
  registrationSetups,
  users,
} from '../src/schema/index.js';
let container: StartedTestContainer | undefined;
let connection: ReturnType<typeof createDatabase> | undefined;
function database() {
  if (!connection) throw new Error('Onboarding database was not initialized');
  return connection.db;
}
beforeAll(async () => {
  const password = randomBytes(24).toString('hex');
  container = await new GenericContainer('postgis/postgis:17-3.5')
    .withEnvironment({
      POSTGRES_DB: 'hsm_test',
      POSTGRES_USER: 'hsm_test',
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  connection = createDatabase(
    `postgres://hsm_test:${password}@${container.getHost()}:${container.getMappedPort(5432)}/hsm_test`,
  );
  await migrate(database(), {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
});
afterAll(async () => {
  await connection?.close();
  await container?.stop();
});
async function person() {
  const [user] = await database()
    .insert(users)
    .values({ fullName: 'Onboarding fixture' })
    .returning();
  if (!user) throw new Error('Identity fixture failed');
  return user.id;
}
async function evidence(userId: string) {
  const rows = await database()
    .insert(files)
    .values(
      [0, 1].map(() => ({
        uploadedBy: userId,
        visibility: 'private' as const,
        bucket: 'private-fixture',
        objectKey: v7(),
        mimeType: 'image/jpeg',
        sizeBytes: 10n,
        sha256: randomBytes(32),
        purpose: 'verification_document' as const,
        scanStatus: 'clean' as const,
      })),
    )
    .returning();
  const [front, back] = rows;
  if (!front || !back) throw new Error('Evidence fixture failed');
  return { cnicFrontFileId: front.id, cnicBackFileId: back.id };
}
it.each([17, 121])('AUTH-C / CHG-006: database rejects customer age %i', async (age) => {
  await expect(
    database()
      .insert(customerProfiles)
      .values({ userId: await person(), age }),
  ).rejects.toThrow();
});
it.each([18, 120, null])(
  'AUTH-C / CHG-006: valid age and historical unset age survive replay: %s',
  async (age) => {
    const userId = await person();
    await database().insert(customerProfiles).values({ userId, age });
    expect(
      (
        await database().select().from(customerProfiles).where(eq(customerProfiles.userId, userId))
      )[0]?.age,
    ).toBe(age);
  },
);
it('AUTH-O / CHG-006: owner evidence requires distinct existing file references and a versioned agreement', async () => {
  const userId = await person();
  const sides = await evidence(userId);
  const values = {
    userId,
    ...sides,
    address: 'Owner fixture address',
    agreementVersion: 'owner-foundation-v1',
    agreementAcceptedAt: new Date(),
    profileCompletedAt: new Date(),
  };
  await expect(
    database()
      .insert(ownerProfiles)
      .values({ ...values, cnicBackFileId: sides.cnicFrontFileId }),
  ).rejects.toThrow();
  await expect(
    database()
      .insert(ownerProfiles)
      .values({ ...values, cnicBackFileId: v7() }),
  ).rejects.toThrow();
  await expect(
    database()
      .insert(ownerProfiles)
      .values({ ...values, agreementVersion: 'unknown' }),
  ).rejects.toThrow();
  await expect(
    database()
      .insert(ownerProfiles)
      .values({ ...values, address: '    ' }),
  ).rejects.toThrow();
  await database().insert(ownerProfiles).values(values);
  expect(
    (await database().select().from(ownerProfiles).where(eq(ownerProfiles.userId, userId)))[0]
      ?.cnicBackFileId,
  ).toBe(sides.cnicBackFileId);
});
it('AUTH-C / CHG-006: setup grants enforce digest uniqueness, format, expiry and identity reference', async () => {
  const createdAt = new Date();
  const values = {
    userId: await person(),
    tokenHash: randomBytes(32).toString('hex'),
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 600000),
  };
  await expect(
    database()
      .insert(registrationSetups)
      .values({ ...values, tokenHash: 'plaintext' }),
  ).rejects.toThrow();
  await expect(
    database()
      .insert(registrationSetups)
      .values({ ...values, expiresAt: createdAt }),
  ).rejects.toThrow();
  await expect(
    database()
      .insert(registrationSetups)
      .values({ ...values, userId: v7() }),
  ).rejects.toThrow();
  await database().insert(registrationSetups).values(values);
  await expect(database().insert(registrationSetups).values(values)).rejects.toThrow();
});
it('AUTH-O / CHG-006: a failed owner transaction rolls back preceding identity changes', async () => {
  const userId = await person();
  const sides = await evidence(userId);
  await expect(
    database().transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ fullName: 'Must roll back' })
        .where(eq(users.id, userId));
      await transaction.insert(ownerProfiles).values({
        userId,
        ...sides,
        address: 'Valid fixture address',
        agreementVersion: 'unaccepted',
        agreementAcceptedAt: new Date(),
        profileCompletedAt: new Date(),
      });
    }),
  ).rejects.toThrow();
  expect((await database().select().from(users).where(eq(users.id, userId)))[0]?.fullName).toBe(
    'Onboarding fixture',
  );
});

it('OWN-001: nullable CNIC photos support onboarding and preserve existing referenced evidence', async () => {
  const userId = await person();
  await database()
    .insert(ownerProfiles)
    .values({
      userId,
      address: 'Owner without photos',
      agreementVersion: 'owner-foundation-v1',
      agreementAcceptedAt: new Date(),
      profileCompletedAt: new Date(),
    });
  const [saved] = await database()
    .select()
    .from(ownerProfiles)
    .where(eq(ownerProfiles.userId, userId));
  expect(saved?.cnicFrontFileId).toBeNull();
  expect(saved?.cnicBackFileId).toBeNull();
  const sides = await evidence(userId);
  await database().update(ownerProfiles).set(sides).where(eq(ownerProfiles.userId, userId));
  await database()
    .update(ownerProfiles)
    .set({ address: 'Owner updated contact' })
    .where(eq(ownerProfiles.userId, userId));
  const [updated] = await database()
    .select()
    .from(ownerProfiles)
    .where(eq(ownerProfiles.userId, userId));
  expect(updated).toMatchObject(sides);
});
