import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { areas, cities, organizations } from '@hsm/db';
import type { authFixture } from './auth-fixture.js';
import { ownerIdentity, ownerRequest } from './owner-profile-fixture.js';
export type SetupFixture = Awaited<ReturnType<typeof authFixture>>;
export async function setupOwner(fixture: SetupFixture, passwordHash: string, now: Date) {
  const identity = await ownerIdentity(fixture, passwordHash, now);
  const response = await ownerRequest(fixture, identity.headers, identity.body);
  if (response.statusCode !== 200) throw new Error('Owner fixture completion failed');
  const [organization] = await fixture.connection.db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.ownerUserId, identity.user.id));
  if (!organization) throw new Error('Owner fixture organization missing');
  return { ...identity, organizationId: organization.id };
}
export async function setupGeography(fixture: SetupFixture) {
  const cityId = randomUUID(),
    areaId = randomUUID(),
    subAreaId = randomUUID();
  await fixture.connection.db
    .insert(cities)
    .values({ id: cityId, name: 'Setup city', slug: cityId });
  await fixture.connection.db.insert(areas).values([
    { id: areaId, cityId, name: 'Setup sector', slug: areaId, level: 'sector' },
    {
      id: subAreaId,
      cityId,
      parentId: areaId,
      name: 'Setup sub-area',
      slug: subAreaId,
      level: 'sub_area',
    },
  ]);
  return {
    cityId,
    areaId,
    subAreaId,
    name: 'Main branch',
    category: 'boys' as const,
    addressLine: 'Actual branch address',
    location: { latitude: 33.6844, longitude: 73.0479 },
  };
}
export const createSetup = (
  fixture: SetupFixture,
  owner: Awaited<ReturnType<typeof setupOwner>>,
  body: Record<string, unknown> = { name: 'Private draft hostel' },
  key = randomUUID(),
) =>
  fixture.application.inject({
    method: 'POST',
    url: `/v1/owner/organizations/${owner.organizationId}/brands`,
    headers: { ...owner.headers, 'idempotency-key': key },
    payload: body,
  });
export const mutateSetup = (
  fixture: SetupFixture,
  owner: Awaited<ReturnType<typeof setupOwner>>,
  brandId: string,
  action: 'basics' | 'main-branch' | 'submit',
  body: Record<string, unknown>,
  key = randomUUID(),
) =>
  fixture.application.inject({
    method: action === 'submit' ? 'POST' : 'PUT',
    url: `/v1/owner/brands/${brandId}/${action}`,
    headers: { ...owner.headers, 'idempotency-key': key },
    payload: body,
  });
