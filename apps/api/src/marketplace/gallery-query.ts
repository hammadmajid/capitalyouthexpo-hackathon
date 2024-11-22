import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import { branches, brands, organizations, cities, listingMedia, files } from '@hsm/db';
import { decodePublicGalleryCursor, type PublicGalleryQuery } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type Reader = Pick<Transaction, 'select'>;
export function publicPhotoEligibility(branchId: string | SQLWrapper, bucket: string) {
  return and(
    eq(listingMedia.branchId, branchId),
    // ROOM-003: room and bed photos appear with their inventory, not the hostel gallery.
    isNull(listingMedia.roomId),
    isNull(listingMedia.archivedAt),
    isNotNull(listingMedia.publishedAt),
    eq(files.scanStatus, 'clean'),
    eq(files.purpose, 'listing_photo'),
    eq(files.visibility, 'private'),
    eq(files.bucket, bucket),
    isNotNull(files.sha256),
    sql<boolean>`octet_length(${files.sha256}) = 32`,
    inArray(files.mimeType, ['image/jpeg', 'image/png', 'image/webp']),
    gt(files.sizeBytes, 0n),
    lte(files.sizeBytes, 8000000n),
  );
}
function eligiblePhotos(branchId: string, input: PublicGalleryQuery, bucket: string) {
  const cursor = input.cursor ? decodePublicGalleryCursor(input.cursor) : undefined;
  return and(
    publicPhotoEligibility(branchId, bucket),
    cursor
      ? or(
          gt(listingMedia.sortOrder, cursor.sortOrder),
          and(eq(listingMedia.sortOrder, cursor.sortOrder), gt(listingMedia.id, cursor.id)),
        )
      : undefined,
  );
}
function photoPage(database: Reader, branchId: string, input: PublicGalleryQuery, bucket: string) {
  return database
    .select({
      branchId: listingMedia.branchId,
      id: listingMedia.id,
      altText: listingMedia.altText,
      sortOrder: listingMedia.sortOrder,
    })
    .from(listingMedia)
    .innerJoin(files, eq(files.id, listingMedia.fileId))
    .where(eligiblePhotos(branchId, input, bucket))
    .orderBy(listingMedia.sortOrder, listingMedia.id)
    .limit(input.limit + 1)
    .as('public_gallery_media');
}
// One SQL snapshot binds eligible image metadata to the currently approved parent.
export function publicGalleryQuery(
  database: Reader,
  branchId: string,
  input: PublicGalleryQuery,
  bucket: string,
) {
  const photos = photoPage(database, branchId, input, bucket);
  return database
    .select({
      branchId: branches.id,
      id: photos.id,
      altText: photos.altText,
      sortOrder: photos.sortOrder,
    })
    .from(branches)
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .innerJoin(cities, eq(cities.id, branches.cityId))
    .leftJoin(photos, eq(photos.branchId, branches.id))
    .where(
      and(
        eq(branches.id, branchId),
        eq(branches.verificationStatus, 'approved'),
        eq(cities.isActive, true),
        isNull(branches.listingHiddenAt),
        isNull(branches.archivedAt),
        isNull(brands.archivedAt),
        isNull(organizations.archivedAt),
      ),
    )
    .orderBy(photos.sortOrder, photos.id)
    .limit(input.limit + 1);
}
export async function readPublicGalleryRows(
  database: Transaction,
  branchId: string,
  input: PublicGalleryQuery,
  bucket: string,
) {
  return await publicGalleryQuery(database, branchId, input, bucket);
}
