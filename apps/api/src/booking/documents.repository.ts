import { and, eq, exists, gt, isNull, or, type SQL } from 'drizzle-orm';
import { v7 } from 'uuid';
import { bookingDocuments, bookings, lockInventoryBranch, type Database } from '@hsm/db';
import {
  DomainError,
  ownerBookingDocumentPageSchema,
  ownBookingDocumentPageSchema,
  type BookingDocumentSubmission,
  type BookingDocumentReview,
  type ManagementPage,
} from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { ownedProfileAttachment } from '../auth/profile-attachments.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { ownerBookingEvidence } from './evidence-access.js';
import { requireBookingCustomer } from './evidence.js';
import { publicBranch } from './projection.js';
import { ownerDocumentState, ownDocumentState } from './document-state.js';
export class BookingDocumentRepository {
  constructor(
    private readonly database: Database,
    private readonly bucket: string,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorizeSubmit(database: Transaction, actor: Actor, branchId: string) {
    await lockActor(database, actor, this.clock);
    await requireBookingCustomer(database, actor);
    if (!(await publicBranch(database, branchId)))
      throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
    await lockInventoryBranch(database, branchId);
    if (!(await publicBranch(database, branchId, true)))
      throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
    return true;
  }
  async authorizeOwner(database: Transaction, actor: Actor, branchId: string) {
    await lockActor(database, actor, this.clock);
    await lockInventoryScope(database, actor, branchId, undefined, true);
    return true;
  }
  own(actor: Actor, branchId: string, page: ManagementPage) {
    return this.database.transaction(async (database) => {
      await lockActor(database, actor, this.clock);
      const condition = and(
        eq(bookingDocuments.customerUserId, actor.userId),
        eq(bookingDocuments.branchId, branchId),
      );
      const rows = await this.page(database, condition, page);
      return ownBookingDocumentPageSchema.parse({
        data: rows.selected.map(ownDocumentState),
        nextCursor: rows.nextCursor,
      });
    });
  }
  queue(actor: Actor, branchId: string, page: ManagementPage) {
    return this.database.transaction(async (database) => {
      await lockActor(database, actor, this.clock);
      await this.authorizeOwner(database, actor, branchId);
      const activeBooking = database
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.id, bookingDocuments.bookingId),
            eq(bookings.branchId, branchId),
            eq(bookings.customerUserId, bookingDocuments.customerUserId),
            eq(bookings.state, 'pending_request'),
            gt(bookings.requestExpiresAt, this.clock()),
          ),
        );
      const condition = and(
        eq(bookingDocuments.branchId, branchId),
        eq(bookingDocuments.state, 'pending'),
        isNull(bookingDocuments.consumedAt),
        or(isNull(bookingDocuments.bookingId), exists(activeBooking)),
      );
      const rows = await this.page(database, condition, page);
      return ownerBookingDocumentPageSchema.parse({
        data: rows.selected.map(ownerDocumentState),
        nextCursor: rows.nextCursor,
      });
    });
  }
  private async page(database: Transaction, condition: SQL | undefined, page: ManagementPage) {
    if (page.cursor) {
      const [cursor] = await database
        .select({ id: bookingDocuments.id })
        .from(bookingDocuments)
        .where(and(condition, eq(bookingDocuments.id, page.cursor)))
        .limit(1);
      if (!cursor) throw new DomainError('NOT_FOUND', 404, 'Evidence page unavailable');
    }
    const rows = await database
      .select()
      .from(bookingDocuments)
      .where(and(condition, page.cursor ? gt(bookingDocuments.id, page.cursor) : undefined))
      .orderBy(bookingDocuments.id)
      .limit(page.limit + 1);
    const selected = rows.slice(0, page.limit);
    return {
      selected,
      nextCursor: rows.length > page.limit ? (selected.at(-1)?.id ?? null) : null,
    };
  }
  async submit(
    database: Transaction,
    actor: Actor,
    branchId: string,
    input: BookingDocumentSubmission,
  ) {
    await this.authorizeSubmit(database, actor, branchId);
    const scope = await lockInventoryBranch(database, branchId);
    const file = await ownedProfileAttachment(database, actor.userId, this.bucket, input.fileId);
    if (!file || file.purpose !== 'resident_document')
      throw new DomainError('NOT_FOUND', 404, 'Booking evidence unavailable');
    if (file.scanStatus !== 'clean')
      throw new DomainError('CONFLICT', 409, 'Booking evidence is not ready');
    const [pending] = await database
      .select()
      .from(bookingDocuments)
      .where(
        and(
          eq(bookingDocuments.customerUserId, actor.userId),
          eq(bookingDocuments.branchId, branchId),
          eq(bookingDocuments.fileId, input.fileId),
          eq(bookingDocuments.kind, input.kind),
          eq(bookingDocuments.state, 'pending'),
          isNull(bookingDocuments.bookingId),
          isNull(bookingDocuments.consumedAt),
        ),
      )
      .orderBy(bookingDocuments.id)
      .limit(1)
      .for('update');
    if (pending) return ownDocumentState(pending);
    const now = this.clock(),
      id = v7();
    const [row] = await database
      .insert(bookingDocuments)
      .values({
        id,
        branchId,
        customerUserId: actor.userId,
        kind: input.kind,
        fileId: input.fileId,
        state: 'pending',
        createdAt: now,
      })
      .returning();
    if (!row) throw new DomainError('INTERNAL', 500, 'Evidence submission unavailable');
    await this.audit.hostel(database, {
      actorUserId: actor.userId,
      actorRole: 'customer',
      organizationId: scope.organization.id,
      branchId,
      action: 'booking.document.submitted',
      targetType: 'booking_document',
      targetId: id,
      after: { kind: input.kind, shareWithOwner: true, state: 'pending' },
      createdAt: now,
    });
    return ownDocumentState(row);
  }
  async review(
    database: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    input: BookingDocumentReview,
  ) {
    await lockActor(database, actor, this.clock);
    const scope = await lockInventoryScope(database, actor, branchId, undefined, true);
    const { document } = await ownerBookingEvidence(
      database,
      actor,
      branchId,
      id,
      this.bucket,
      this.clock,
      this.audit,
    );
    if (document.state !== 'pending')
      throw new DomainError('CONFLICT', 409, 'Completed review requires a new submission');
    if (document.bookingId) {
      const [booking] = await database
        .select({ state: bookings.state })
        .from(bookings)
        .where(eq(bookings.id, document.bookingId));
      if (booking?.state !== 'pending_request')
        throw new DomainError('CONFLICT', 409, 'Pre-confirmation review is no longer available');
    }
    const now = this.clock(),
      rejectionCode = input.state === 'rejected' ? input.rejectionCode : null;
    const [row] = await database
      .update(bookingDocuments)
      .set({ state: input.state, reviewedByUserId: actor.userId, reviewedAt: now, rejectionCode })
      .where(
        and(
          eq(bookingDocuments.id, id),
          eq(bookingDocuments.branchId, branchId),
          eq(bookingDocuments.state, 'pending'),
          isNull(bookingDocuments.consumedAt),
        ),
      )
      .returning();
    if (!row) throw new DomainError('CONFLICT', 409, 'Evidence review changed');
    await this.audit.hostel(database, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'booking.document.reviewed',
      targetType: 'booking_document',
      targetId: id,
      before: { state: 'pending' },
      after: { state: input.state, rejectionCode },
      createdAt: now,
    });
    return ownerDocumentState(row);
  }
}
