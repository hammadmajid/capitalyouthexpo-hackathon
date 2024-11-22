import {
  and,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { files, listingMedia } from '@hsm/db';
import type { ListingReader } from './listing-query.js';

export const selectableMedia = alias(listingMedia, 'selectable_media');
const media = selectableMedia,
  image = alias(files, 'selectable_image');

// ROOM-003 / SEAT-002: only explicitly published, currently clean listing images count.
function publishedImage(branch: string | SQLWrapper) {
  return and(
    eq(media.branchId, branch),
    isNull(media.archivedAt),
    isNotNull(media.publishedAt),
    eq(image.scanStatus, 'clean'),
    eq(image.purpose, 'listing_photo'),
    eq(image.visibility, 'private'),
    isNotNull(image.sha256),
    sql<boolean>`octet_length(${image.sha256}) = 32`,
    inArray(image.mimeType, ['image/jpeg', 'image/png', 'image/webp']),
    gt(image.sizeBytes, 0n),
    lte(image.sizeBytes, 8000000n),
  );
}
function photoExists(database: ListingReader, condition: SQL | undefined) {
  return exists(
    database
      .select({ id: media.id })
      .from(media)
      .innerJoin(image, eq(image.id, media.fileId))
      .where(condition),
  );
}
// ROOM-003: a room is publicly selectable only with at least one published room photo.
export function publishedRoomPhoto(
  database: ListingReader,
  branch: string | SQLWrapper,
  room: string | SQLWrapper,
) {
  return photoExists(
    database,
    and(publishedImage(branch), eq(media.roomId, room), isNull(media.seatId)),
  );
}
// ROOM-003 / ROOM-004: a bed additionally needs its own specific published photo.
export function publishedBedPhoto(
  database: ListingReader,
  branch: string | SQLWrapper,
  room: string | SQLWrapper,
  bed: string | SQLWrapper,
) {
  return sql<boolean>`(${publishedRoomPhoto(database, branch, room)} and ${photoExists(
    database,
    and(publishedImage(branch), eq(media.seatId, bed)),
  )})`;
}
// ROOM-004: bounded published photo identities per selectable room or bed, in gallery order.
export async function publishedPhotoIds(
  database: ListingReader,
  branchId: string,
  target: { rooms: string[] } | { beds: string[] },
) {
  const ids = 'rooms' in target ? target.rooms : target.beds;
  const result = new Map<string, string[]>();
  if (!ids.length) return result;
  const owner = 'rooms' in target ? media.roomId : media.seatId;
  const rows = await database
    .select({ owner, id: media.id })
    .from(media)
    .innerJoin(image, eq(image.id, media.fileId))
    .where(
      and(
        publishedImage(branchId),
        inArray(owner, ids),
        'rooms' in target ? isNull(media.seatId) : undefined,
      ),
    )
    .orderBy(owner, media.sortOrder, media.id);
  for (const row of rows) {
    if (!row.owner) continue;
    const list = result.get(row.owner) ?? [];
    if (list.length < 12) list.push(row.id);
    result.set(row.owner, list);
  }
  return result;
}
