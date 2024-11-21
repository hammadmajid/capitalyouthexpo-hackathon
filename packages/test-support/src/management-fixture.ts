import { randomInt, randomUUID } from 'node:crypto';
import {
  areas,
  brands,
  branches,
  cities,
  managerAssignments,
  organizations,
  users,
  type Database,
} from '@hsm/db';
export async function managementFixture(database: Database, tempHash: string, now: Date) {
  const ownerId = randomUUID(),
    managerId = randomUUID(),
    cityId = randomUUID();
  const areaId = randomUUID(),
    organizationId = randomUUID(),
    brandId = randomUUID();
  const branchA = randomUUID(),
    branchB = randomUUID(),
    assignmentId = randomUUID();
  const phone = '+923' + randomInt(0, 1000000000).toString().padStart(9, '0');
  await database.insert(users).values([
    { id: ownerId, fullName: 'Integration Owner' },
    { id: managerId, fullName: 'Integration Manager', phoneE164: phone },
  ]);
  await database.insert(cities).values({ id: cityId, name: 'Test city', slug: cityId });
  await database
    .insert(areas)
    .values({ id: areaId, cityId, name: 'Test area', slug: areaId, level: 'area' });
  await database
    .insert(organizations)
    .values({ id: organizationId, ownerUserId: ownerId, name: 'Test organization' });
  await database.insert(brands).values({ id: brandId, organizationId, name: 'Test brand' });
  const branch = {
    organizationId,
    brandId,
    cityId,
    areaId,
    category: 'boys' as const,
    addressLine: 'Integration fixture',
    location: 'SRID=4326;POINT(73 33)',
  };
  await database.insert(branches).values([
    { ...branch, id: branchA, name: 'Branch A', slug: branchA },
    { ...branch, id: branchB, name: 'Branch B', slug: branchB },
  ]);
  await database.insert(managerAssignments).values({
    id: assignmentId,
    userId: managerId,
    branchId: branchA,
    appointedByUserId: ownerId,
    tempPasswordHash: tempHash,
    tempPasswordExpiresAt: new Date(now.getTime() + 86400000),
  });
  return { ownerId, managerId, branchA, branchB, assignmentId, phone };
}
