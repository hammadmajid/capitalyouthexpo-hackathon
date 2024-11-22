import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { areas, branchVerificationEvents, brands, branches, cities } from '@hsm/db';
import {
  DomainError,
  hostelOnboardingSchema,
  mainBranchDraftSchema,
  type MainBranchDraft,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { missingSetupFields, requireDraftGeography } from './hostel-setup.policy.js';
// BRN-001: without branchId this reads the primary branch; with it, that branch of the brand.
export async function readHostelSetup(database: Transaction, brandId: string, branchId?: string) {
  const [brand] = await database
    .select({
      id: brands.id,
      organizationId: brands.organizationId,
      name: brands.name,
      logoFileId: brands.logoFileId,
    })
    .from(brands)
    .where(and(eq(brands.id, brandId), isNull(brands.archivedAt)));
  if (!brand) throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
  const [row] = await database
    .select({
      id: branches.id,
      name: branches.name,
      isPrimary: branches.isPrimary,
      category: branches.category,
      propertyTier: branches.propertyTier,
      establishmentYear: branches.establishmentYear,
      cityId: branches.cityId,
      areaId: branches.areaId,
      subAreaId: branches.subAreaId,
      addressLine: branches.addressLine,
      nearbyLandmark: branches.nearbyLandmark,
      description: branches.description,
      phone: branches.publicPhone,
      showPublicContact: branches.showPublicContact,
      verificationStatus: branches.verificationStatus,
      latitude: sql<number | null>`ST_Y(${branches.location}::geometry)`,
      longitude: sql<number | null>`ST_X(${branches.location}::geometry)`,
    })
    .from(branches)
    .where(
      and(
        eq(branches.brandId, brandId),
        eq(branches.organizationId, brand.organizationId),
        branchId ? eq(branches.id, branchId) : eq(branches.isPrimary, true),
        isNull(branches.archivedAt),
      ),
    )
    .for('update');
  if (branchId && !row) throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
  const mainBranch = row
    ? mainBranchDraftSchema.parse({
        id: row.id,
        name: row.name,
        isPrimary: row.isPrimary,
        category: row.category,
        propertyTier: row.propertyTier,
        establishmentYear: row.establishmentYear,
        cityId: row.cityId,
        areaId: row.areaId,
        subAreaId: row.subAreaId,
        addressLine: row.addressLine,
        nearbyLandmark: row.nearbyLandmark,
        description: row.description,
        phone: row.phone,
        showPublicContact: row.showPublicContact,
        verificationStatus: row.verificationStatus,
        location:
          row.latitude === null || row.longitude === null
            ? null
            : {
                latitude: row.latitude,
                longitude: row.longitude,
              },
      })
    : null;
  const noted =
    mainBranch && ['changes_requested', 'rejected'].includes(mainBranch.verificationStatus);
  const [note] = noted
    ? await database
        .select({ reason: branchVerificationEvents.reason })
        .from(branchVerificationEvents)
        .where(
          and(
            eq(branchVerificationEvents.branchId, mainBranch.id),
            eq(branchVerificationEvents.toStatus, mainBranch.verificationStatus),
          ),
        )
        .orderBy(desc(branchVerificationEvents.createdAt), desc(branchVerificationEvents.id))
        .limit(1)
    : [];
  return hostelOnboardingSchema.parse({
    ...brand,
    mainBranch,
    missingFields: missingSetupFields(mainBranch),
    ...(note?.reason ? { verificationNote: note.reason } : {}),
  });
}
export async function validateSetupGeography(database: Transaction, branch: MainBranchDraft) {
  const [city] = branch.cityId
    ? await database
        .select({ id: cities.id, isActive: cities.isActive })
        .from(cities)
        .where(eq(cities.id, branch.cityId))
        .for('share')
    : [];
  const ids = [branch.areaId, branch.subAreaId].filter((id): id is string => id !== null);
  const selected = ids.length
    ? await database
        .select({
          id: areas.id,
          cityId: areas.cityId,
          parentId: areas.parentId,
          level: areas.level,
          isActive: areas.isActive,
        })
        .from(areas)
        .where(inArray(areas.id, ids))
        .orderBy(areas.id)
        .for('share')
    : [];
  requireDraftGeography(
    branch,
    city,
    selected.find((row) => row.id === branch.areaId),
    selected.find((row) => row.id === branch.subAreaId),
  );
}
export function mainBranchValues(branch: MainBranchDraft, now: Date) {
  return {
    name: branch.name,
    category: branch.category,
    propertyTier: branch.propertyTier ?? null,
    establishmentYear: branch.establishmentYear ?? null,
    cityId: branch.cityId,
    areaId: branch.areaId,
    subAreaId: branch.subAreaId,
    addressLine: branch.addressLine,
    nearbyLandmark: branch.nearbyLandmark,
    description: branch.description,
    publicPhone: branch.phone,
    showPublicContact: branch.showPublicContact,
    updatedAt: now,
    // Drizzle binds validated EWKT as data; no string-built SQL is executed.
    location: branch.location
      ? `SRID=4326;POINT(${branch.location.longitude} ${branch.location.latitude})`
      : null,
  };
}
