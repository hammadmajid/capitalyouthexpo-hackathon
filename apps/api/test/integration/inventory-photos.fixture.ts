import { createHash, randomUUID } from 'node:crypto';
import { verifiedKey } from '@hsm/files';
import { files, listingMedia, type Database } from '@hsm/db';
// ROOM-003: published clean room and bed photos make fixture inventory publicly selectable.
// Selectability reads verified metadata; byte delivery is covered by the real gallery suites.
export async function publishInventoryPhotos(
  database: Database,
  input: {
    bucket: string;
    ownerId: string;
    branchId: string;
    roomId: string;
    seatIds: string[];
    now: Date;
  },
) {
  const targets = [
    { roomId: input.roomId, seatId: null },
    ...input.seatIds.map((seatId) => ({ roomId: input.roomId, seatId })),
  ];
  const media: string[] = [];
  for (const [index, target] of targets.entries()) {
    const fileId = randomUUID(),
      id = randomUUID();
    await database.insert(files).values({
      id: fileId,
      uploadedBy: input.ownerId,
      bucket: input.bucket,
      visibility: 'private',
      objectKey: verifiedKey('listing_photo', fileId),
      mimeType: 'image/png',
      sizeBytes: 68n,
      purpose: 'listing_photo',
      scanStatus: 'clean',
      sha256: createHash('sha256').update(fileId).digest(),
    });
    await database.insert(listingMedia).values({
      id,
      branchId: input.branchId,
      fileId,
      ...target,
      sortOrder: index,
      altText: target.seatId ? 'Fixture bed photo' : 'Fixture room photo',
      publishedAt: input.now,
      publishedByUserId: input.ownerId,
    });
    media.push(id);
  }
  return media;
}
