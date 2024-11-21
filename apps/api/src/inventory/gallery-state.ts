import { storageKey } from '@hsm/files';
import { createHash } from 'node:crypto';
import { and, eq, getTableColumns, gt, isNotNull, isNull } from 'drizzle-orm';
import { files, listingMedia } from '@hsm/db';
import {
  DomainError,
  galleryMediaSchema,
  galleryPageSchema,
  type GalleryQuery,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export const galleryColumns = {
  ...getTableColumns(listingMedia),
  objectKey: files.objectKey,
  sha256: files.sha256,
  mimeType: files.mimeType,
  sizeBytes: files.sizeBytes,
  scanStatus: files.scanStatus,
};
export type GalleryRow = typeof listingMedia.$inferSelect &
  Pick<typeof files.$inferSelect, 'objectKey' | 'sha256' | 'mimeType' | 'sizeBytes' | 'scanStatus'>;
export function projectGallery(row: GalleryRow) {
  const value = {
    id: row.id,
    branchId: row.branchId,
    fileId: row.fileId,
    altText: row.altText,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    scanStatus: row.scanStatus,
  };
  const version = createHash('sha256')
    .update(
      JSON.stringify({
        ...value,
        objectKey: row.objectKey,
        digest: row.sha256?.toString('hex') ?? null,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes.toString(),
      }),
    )
    .digest('hex');
  // Targets are fixed at attachment, so they stay outside the mutable-state version.
  return galleryMediaSchema.parse({
    ...value,
    roomId: row.roomId,
    bedId: row.seatId,
    version,
  });
}
export function cleanGalleryImage(
  file: Pick<GalleryRow, 'objectKey' | 'sha256' | 'mimeType' | 'sizeBytes' | 'scanStatus'> & {
    id: string;
  },
) {
  if (
    file.scanStatus !== 'clean' ||
    file.sha256?.byteLength !== 32 ||
    !storageKey.safeParse(file.objectKey).success ||
    !file.objectKey.startsWith('private/listing_photo/' + file.id + '/') ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType) ||
    file.sizeBytes <= 0n ||
    file.sizeBytes > 8000000n
  )
    throw new DomainError('CONFLICT', 409, 'A clean verified listing image is required');
}
function scope(branchId: string, bucket: string) {
  return [
    eq(listingMedia.branchId, branchId),
    eq(files.bucket, bucket),
    eq(files.visibility, 'private'),
    eq(files.purpose, 'listing_photo'),
  ];
}
// ROOM-002/003: without a room filter the gallery is the hostel-level gallery.
export function galleryTarget(roomId?: string | null, bedId?: string | null) {
  return [
    roomId ? eq(listingMedia.roomId, roomId) : isNull(listingMedia.roomId),
    bedId ? eq(listingMedia.seatId, bedId) : isNull(listingMedia.seatId),
  ];
}
export async function readGalleryPage(
  transaction: Transaction,
  branchId: string,
  bucket: string,
  query: GalleryQuery,
  canEdit: boolean,
  canPublish = false,
) {
  const rows = await transaction
    .select(galleryColumns)
    .from(listingMedia)
    .innerJoin(files, eq(files.id, listingMedia.fileId))
    .where(
      and(
        ...scope(branchId, bucket),
        query.cursor ? gt(listingMedia.id, query.cursor) : undefined,
        ...galleryTarget(query.roomId, query.bedId),
        query.state === 'active'
          ? isNull(listingMedia.archivedAt)
          : query.state === 'archived'
            ? isNotNull(listingMedia.archivedAt)
            : undefined,
      ),
    )
    .orderBy(listingMedia.id)
    .limit(query.limit + 1)
    .for('share');
  const visible = rows.slice(0, query.limit);
  return galleryPageSchema.parse({
    data: visible.map(projectGallery),
    canEdit,
    canPublish,
    nextCursor: rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
  });
}
export async function readGalleryRow(
  transaction: Transaction,
  branchId: string,
  id: string,
  bucket: string,
) {
  const [row] = await transaction
    .select(galleryColumns)
    .from(listingMedia)
    .innerJoin(files, eq(files.id, listingMedia.fileId))
    .where(and(...scope(branchId, bucket), eq(listingMedia.id, id)))
    .limit(1)
    .for('update');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Listing image unavailable');
  return row;
}
