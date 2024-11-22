import { createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { amenities, branchAmenities, branches } from '@hsm/db';
import {
  DomainError,
  contactPhoneE164,
  listingFieldsSchema,
  privateListingSchema,
  amenityCatalogPageSchema,
  type ListingFields,
  type AmenityCatalogQuery,
} from '@hsm/contracts';
import type { z } from 'zod';
import type { selectedListingAmenitySchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type SelectedAmenity = z.infer<typeof selectedListingAmenitySchema>;
function orderedAmenities(selected: readonly SelectedAmenity[]) {
  return [...selected]
    .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0))
    .map((row) => ({ code: row.code, name: row.name, isActive: row.isActive }));
}
export function listingVersion(
  branchId: string,
  fields: ListingFields,
  selected: readonly SelectedAmenity[],
  canEdit: boolean,
) {
  const values = listingFieldsSchema.parse(fields),
    codes = orderedAmenities(selected);
  return createHash('sha256')
    .update(JSON.stringify({ branchId, values, amenities: codes, canEdit }))
    .digest('hex');
}
// Caller owns the branch scope lock. Bound association reads fail rather than truncate.
export async function readListingState(transaction: Transaction, branchId: string) {
  const [branch] = await transaction
    .select({
      description: branches.description,
      nearbyLandmark: branches.nearbyLandmark,
      publicPhone: branches.publicPhone,
      publicEmail: branches.publicEmail,
      showPublicContact: branches.showPublicContact,
    })
    .from(branches)
    .where(eq(branches.id, branchId));
  if (!branch) throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
  const selected = await transaction
    .select({ code: amenities.code, name: amenities.name, isActive: amenities.isActive })
    .from(branchAmenities)
    .innerJoin(amenities, eq(amenities.code, branchAmenities.amenityCode))
    .where(eq(branchAmenities.branchId, branchId))
    .orderBy(amenities.code)
    .limit(101)
    .for('share');
  if (selected.length > 100)
    throw new DomainError(
      'CONFLICT',
      409,
      'Listing configuration exceeds the supported association limit',
    );
  // TRUST-006: hostel setup used to store local formats ("0315…"); read them as E.164 so a
  // listing never fails on its own saved contact. Saving the listing then stores E.164.
  const publicPhone = branch.publicPhone === null ? null : contactPhoneE164(branch.publicPhone);
  return { fields: listingFieldsSchema.parse({ ...branch, publicPhone }), selected };
}
export function projectListing(
  branchId: string,
  state: Awaited<ReturnType<typeof readListingState>>,
  canEdit: boolean,
) {
  return privateListingSchema.parse({
    branchId,
    ...state.fields,
    amenities: orderedAmenities(state.selected),
    version: listingVersion(branchId, state.fields, state.selected, canEdit),
    canEdit,
  });
}
export async function readAmenityCatalog(transaction: Transaction, query: AmenityCatalogQuery) {
  const rows = await transaction
    .select({ code: amenities.code, name: amenities.name })
    .from(amenities)
    .where(
      and(
        eq(amenities.isActive, true),
        isNull(amenities.organizationId),
        query.cursor ? gt(amenities.code, query.cursor) : undefined,
      ),
    )
    .orderBy(amenities.code)
    .limit(query.limit + 1);
  const data = rows.slice(0, query.limit);
  return amenityCatalogPageSchema.parse({
    data,
    nextCursor: rows.length > query.limit ? (data.at(-1)?.code ?? null) : null,
  });
}
