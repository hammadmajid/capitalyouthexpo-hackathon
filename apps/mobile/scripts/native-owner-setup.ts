import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { and, eq, sql } from 'drizzle-orm';
import {
  areas,
  brands,
  branches,
  cities,
  files,
  organizations,
  ownerProfiles,
  users,
} from '@hsm/db';
import { z } from 'zod';
import type { authStack } from '@hsm/test-support';
type Stack = Awaited<ReturnType<typeof authStack>>;
type Flow = (name: string, variables?: Record<string, string>) => Promise<void>;
// Owner profile/document metadata are preconditions for this UI scenario.
// Real byte upload/scanning/private storage acceptance remains in the browser/container suites.
async function prepareOwner(stack: Stack) {
  const id = randomUUID(),
    email = id + '@example.test',
    password = randomBytes(18).toString('hex');
  const phone = '+923' + randomInt(0, 1000000000).toString().padStart(9, '0');
  const db = stack.database.db;
  await db.insert(users).values({
    id,
    fullName: 'Native Owner',
    email,
    emailVerifiedAt: new Date(),
    passwordHash: await hash(password, {
      type: argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    }),
  });
  const documents = [randomUUID(), randomUUID()];
  await db.insert(files).values(
    documents.map((fileId) => ({
      id: fileId,
      uploadedBy: id,
      visibility: 'private' as const,
      bucket: stack.storage.bucket,
      objectKey: randomUUID(),
      mimeType: 'application/pdf',
      sizeBytes: 100n,
      sha256: randomBytes(32),
      purpose: 'verification_document' as const,
      scanStatus: 'clean' as const,
    })),
  );
  const login = await fetch(stack.apiUrl + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: email, password, client: 'mobile' }),
  });
  assert.equal(login.status, 200);
  const token = z.object({ accessToken: z.string() }).parse(await login.json()).accessToken;
  const response = await fetch(stack.apiUrl + '/me/owner-profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({
      fullName: 'Native Owner',
      phone,
      cnic: '61101' + randomInt(0, 100000000).toString().padStart(8, '0'),
      cnicFrontFileId: documents[0],
      cnicBackFileId: documents[1],
      address: 'Private native Owner address',
      agreementAccepted: true,
      agreementVersion: 'owner-foundation-v1',
    }),
  });
  assert.equal(response.status, 200);
  const [profile] = await db.select().from(ownerProfiles).where(eq(ownerProfiles.userId, id));
  assert(profile?.profileCompletedAt);
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.ownerUserId, id));
  assert(organization);
  await db
    .update(organizations)
    .set({ name: 'Native organization' })
    .where(eq(organizations.id, organization.id));
  const cityId = randomUUID(),
    areaId = randomUUID();
  await db.insert(cities).values({ id: cityId, name: 'Native city', slug: cityId });
  await db
    .insert(areas)
    .values({ id: areaId, cityId, name: 'Native area', slug: areaId, level: 'sector' });
  return { id, email, password, cityId, areaId, organizationId: organization.id };
}
export async function nativeOwnerSetup(stack: Stack, flow: Flow) {
  const owner = await prepareOwner(stack);
  await flow('owner-setup', { EMAIL: owner.email, PASSWORD: owner.password });
  const [saved] = await stack.database.db
    .select({
      id: branches.id,
      address: branches.addressLine,
      cityId: branches.cityId,
      areaId: branches.areaId,
      latitude: sql<number>`ST_Y(${branches.location}::geometry)`,
      longitude: sql<number>`ST_X(${branches.location}::geometry)`,
      status: branches.verificationStatus,
    })
    .from(branches)
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .where(
      and(
        eq(brands.organizationId, owner.organizationId),
        eq(brands.name, 'Native private hostel'),
      ),
    );
  assert(saved);
  assert.equal(saved.address, 'Private native branch address');
  assert.equal(saved.cityId, owner.cityId);
  assert.equal(saved.areaId, owner.areaId);
  assert.equal(saved.status, 'draft');
  assert(Number.isFinite(saved.latitude) && Math.abs(saved.latitude - 33.6844) < 1);
  assert(Number.isFinite(saved.longitude) && Math.abs(saved.longitude - 73.0479) < 1);
  await flow('owner-resume-submit');
  const [submitted] = await stack.database.db
    .select({ status: branches.verificationStatus, approvedAt: branches.firstApprovedAt })
    .from(branches)
    .where(eq(branches.id, saved.id));
  assert.deepEqual(submitted, { status: 'submitted', approvedAt: null });
}
