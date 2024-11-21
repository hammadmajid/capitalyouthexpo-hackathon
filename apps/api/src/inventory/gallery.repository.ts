import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { files, listingMedia, rooms, seats, type Database } from '@hsm/db';
import {
  DomainError,
  type GalleryAttach,
  type GalleryEdit,
  type GalleryQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { publishedGalleryVersion } from './gallery-publication-provenance.js';
import {
  cleanGalleryImage,
  projectGallery,
  readGalleryPage,
  readGalleryRow,
  galleryTarget,
} from './gallery-state.js';
export class GalleryRepository {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(transaction: Transaction, actor: Actor, branchId: string, edit = true) {
    await lockActor(transaction, actor, this.clock);
    const scope = await lockInventoryScope(
      transaction,
      actor,
      branchId,
      edit ? 'listing_edit' : undefined,
    );
    await lockActor(transaction, actor, this.clock);
    return scope;
  }
  async authorizeImageAction(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    mediaId: string,
    publication = false,
    version?: string,
  ) {
    const scope = await this.authorize(transaction, actor, branchId);
    const row = await readGalleryRow(transaction, branchId, mediaId, this.bucket);
    const originallyPublished =
      !publication && row.publishedAt === null && version
        ? (await publishedGalleryVersion(transaction, branchId, mediaId, version)).length > 0
        : false;
    if (publication || row.publishedAt !== null || originallyPublished) {
      await lockInventoryScope(transaction, actor, branchId, 'media_publish');
    }
    await lockActor(transaction, actor, this.clock);
    return { scope, row };
  }
  read(actor: Actor, branchId: string, query: GalleryQuery) {
    return this.database.transaction(async (transaction) => {
      const scope = await this.authorize(transaction, actor, branchId, false),
        access = await inventoryPermissions(
          transaction,
          actor,
          branchId,
          scope.actorRole === 'owner',
        ),
        result = await readGalleryPage(
          transaction,
          branchId,
          this.bucket,
          query,
          access.permissions.includes('listing_edit'),
          access.permissions.includes('listing_edit') &&
            access.permissions.includes('media_publish'),
        );
      await lockActor(transaction, actor, this.clock);
      return result;
    });
  }
  private async ownedImage(transaction: Transaction, actor: Actor, fileId: string) {
    const [file] = await transaction
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.uploadedBy, actor.userId),
          eq(files.bucket, this.bucket),
          eq(files.visibility, 'private'),
          eq(files.purpose, 'listing_photo'),
        ),
      )
      .limit(1)
      .for('update');
    if (!file) throw new DomainError('NOT_FOUND', 404, 'Listing image unavailable');
    cleanGalleryImage(file);
    return file;
  }
  private async current(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    version: string,
    publication = false,
  ) {
    const { scope, row } = await this.authorizeImageAction(
      transaction,
      actor,
      branchId,
      id,
      publication,
      version,
    );
    const before = projectGallery(row);
    if (before.version !== version)
      throw new DomainError(
        'PRECONDITION_FAILED',
        412,
        'Listing image changed; refresh its current state',
      );
    if (row.archivedAt) throw new DomainError('CONFLICT', 409, 'Listing image is archived');
    return { scope, row, before };
  }
  private async changed(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    scope: Awaited<ReturnType<typeof lockInventoryScope>>,
    id: string,
    action: string,
    before: ReturnType<typeof projectGallery> | null,
    details: Record<string, unknown> = {},
  ) {
    const after = projectGallery(await readGalleryRow(transaction, branchId, id, this.bucket));
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action,
      targetType: 'listing_media',
      targetId: id,
      before,
      after: { ...after, ...details },
      createdAt: this.clock(),
    });
    await lockActor(transaction, actor, this.clock);
    return after;
  }
  // ROOM-002/003: a room or bed photo must target current inventory in this branch.
  private async target(transaction: Transaction, branchId: string, input: GalleryAttach) {
    if (!input.target) return { roomId: null, seatId: null };
    const [room] = await transaction
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(
          eq(rooms.id, input.target.roomId),
          eq(rooms.branchId, branchId),
          isNull(rooms.archivedAt),
        ),
      )
      .for('share');
    if (!room) throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
    if (input.target.kind === 'room') return { roomId: room.id, seatId: null };
    const [seat] = await transaction
      .select({ id: seats.id })
      .from(seats)
      .where(
        and(
          eq(seats.id, input.target.bedId),
          eq(seats.roomId, room.id),
          eq(seats.branchId, branchId),
          isNull(seats.archivedAt),
        ),
      )
      .for('share');
    if (!seat) throw new DomainError('NOT_FOUND', 404, 'Bed unavailable');
    return { roomId: room.id, seatId: seat.id };
  }
  async attach(transaction: Transaction, actor: Actor, branchId: string, input: GalleryAttach) {
    const scope = await this.authorize(transaction, actor, branchId);
    await this.ownedImage(transaction, actor, input.fileId);
    const target = await this.target(transaction, branchId, input);
    const [existing] = await transaction
      .select({ id: listingMedia.id })
      .from(listingMedia)
      .where(
        and(
          eq(listingMedia.branchId, branchId),
          eq(listingMedia.fileId, input.fileId),
          isNull(listingMedia.archivedAt),
        ),
      )
      .limit(1)
      .for('update');
    if (existing) throw new DomainError('CONFLICT', 409, 'This image is already attached');
    await lockActor(transaction, actor, this.clock);
    const id = v7();
    await transaction.insert(listingMedia).values({
      id,
      branchId,
      fileId: input.fileId,
      altText: input.altText,
      sortOrder: input.sortOrder,
      ...target,
      publishedAt: null,
      publishedByUserId: null,
      createdAt: this.clock(),
    });
    return this.changed(transaction, actor, branchId, scope, id, 'listing.image.attached', null);
  }
  async edit(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    version: string,
    input: GalleryEdit,
  ) {
    const { scope, row, before } = await this.current(
      transaction,
      actor,
      branchId,
      id,
      version,
      input.published,
    );
    if (input.published) cleanGalleryImage({ ...row, id: row.fileId });
    await lockActor(transaction, actor, this.clock);
    await transaction
      .update(listingMedia)
      .set({
        altText: input.altText,
        sortOrder: input.sortOrder,
        publishedAt: input.published ? (row.publishedAt ?? this.clock()) : null,
        publishedByUserId: input.published ? (row.publishedByUserId ?? actor.userId) : null,
      })
      .where(and(eq(listingMedia.id, id), eq(listingMedia.branchId, branchId)));
    return this.changed(transaction, actor, branchId, scope, id, 'listing.image.changed', before);
  }
  async archive(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    version: string,
    reason: string,
  ) {
    const { scope, before } = await this.current(transaction, actor, branchId, id, version);
    await lockActor(transaction, actor, this.clock);
    await transaction
      .update(listingMedia)
      .set({ archivedAt: this.clock() })
      .where(and(eq(listingMedia.id, id), eq(listingMedia.branchId, branchId)));
    return this.changed(transaction, actor, branchId, scope, id, 'listing.image.archived', before, {
      reason,
    });
  }
  async cover(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    version: string,
  ) {
    const { scope, row, before } = await this.current(
      transaction,
      actor,
      branchId,
      id,
      version,
      true,
    );
    cleanGalleryImage({ ...row, id: row.fileId });
    const [maximum] = await transaction
      .select({ order: listingMedia.sortOrder })
      .from(listingMedia)
      .where(
        and(
          eq(listingMedia.branchId, branchId),
          ne(listingMedia.id, id),
          isNull(listingMedia.archivedAt),
          ...galleryTarget(row.roomId, row.seatId),
        ),
      )
      .orderBy(desc(listingMedia.sortOrder))
      .limit(1)
      .for('update');
    if (maximum && maximum.order >= 2147483647)
      throw new DomainError('CONFLICT', 409, 'Reorder the gallery before promoting this image');
    await lockActor(transaction, actor, this.clock);
    await transaction
      .update(listingMedia)
      .set({ sortOrder: sql`${listingMedia.sortOrder} + 1` })
      .where(
        and(
          eq(listingMedia.branchId, branchId),
          ne(listingMedia.id, id),
          isNull(listingMedia.archivedAt),
          ...galleryTarget(row.roomId, row.seatId),
        ),
      );
    await transaction
      .update(listingMedia)
      .set({ sortOrder: 0 })
      .where(and(eq(listingMedia.id, id), eq(listingMedia.branchId, branchId)));
    return this.changed(
      transaction,
      actor,
      branchId,
      scope,
      id,
      'listing.image.cover_selected',
      before,
      { otherActiveImagesOrderDelta: 1 },
    );
  }
}
