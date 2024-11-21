import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { files, listingMedia, roomTypes, type Database } from '@hsm/db';
import {
  stayIdentifierSchema as id,
  verificationPageQuerySchema,
  verificationPhotosSchema,
  verificationPricingSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockAdmin } from './scope.js';
import { verificationRecord } from './verification-record.js';
import type { VerificationStorage } from './verification-evidence.js';
export class VerificationListingService {
  constructor(
    private readonly database: Database,
    private readonly options?: VerificationStorage,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  pricing(actor: Actor, branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = verificationPageQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      await verificationRecord(tx, branch);
      const rows = await tx
        .select({
          id: roomTypes.id,
          name: roomTypes.name,
          inventoryMode: roomTypes.inventoryMode,
          capacity: roomTypes.capacity,
          bedMonthlyRentPaisa: roomTypes.bedMonthlyRentPaisa,
          roomMonthlyRentPaisa: roomTypes.roomMonthlyRentPaisa,
          depositPaisa: roomTypes.depositPaisa,
        })
        .from(roomTypes)
        .where(
          and(
            eq(roomTypes.branchId, branch),
            isNull(roomTypes.archivedAt),
            input.cursor ? gt(roomTypes.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(roomTypes.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return verificationPricingSchema.parse({
        data: page.map((row) => ({
          ...row,
          bedMonthlyRentPaisa: row.bedMonthlyRentPaisa?.toString() ?? null,
          roomMonthlyRentPaisa: row.roomMonthlyRentPaisa?.toString() ?? null,
          depositPaisa: row.depositPaisa.toString(),
        })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      });
    });
  }
  photos(actor: Actor, branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = verificationPageQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'verification', this.clock);
      await verificationRecord(tx, branch);
      const rows = await tx
        .select({ media: listingMedia, file: files })
        .from(listingMedia)
        .innerJoin(files, eq(files.id, listingMedia.fileId))
        .where(
          and(
            eq(listingMedia.branchId, branch),
            isNull(listingMedia.archivedAt),
            input.cursor ? gt(listingMedia.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(listingMedia.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return verificationPhotosSchema.parse({
        data: page.map(({ media, file }) => ({
          id: media.id,
          fileId: file.id,
          roomId: media.roomId,
          seatId: media.seatId,
          altText: media.altText,
          mimeType: file.mimeType,
          available: Boolean(
            this.options &&
            file.purpose === 'listing_photo' &&
            file.visibility === 'private' &&
            file.bucket === this.options.bucket &&
            file.scanStatus === 'clean' &&
            file.sha256?.length === 32 &&
            file.objectKey.startsWith('private/listing_photo/' + file.id + '/'),
          ),
        })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.media.id ?? null) : null,
      });
    });
  }
}
