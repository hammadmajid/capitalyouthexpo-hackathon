import { confirmationContext } from './confirmation-context.js';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import {
  enqueueBookingLifecycle,
  lockInventoryBranch,
  branches,
  rooms,
  seats,
  bookings,
  stays,
  inventoryClaims,
  bookingHistory,
  bookingUpfrontTerms,
  expireRoomReservations,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  bookingQuoteSnapshotSchema,
  type BranchBookingPageQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { requireCustomerCancellation } from './policy.js';
import { requireConfirmable } from './confirmation-checks.js';
import { requireVerifiedUpfront } from './upfront.js';
import { lockPublicInventory } from './quote.js';
import { bookingPage, bookingProjection } from './projection.js';
type Scope = { customerUserId: string } | { branchId: string };
export class BookingActionRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
    private readonly bucket?: string,
  ) {}
  confirmationContext(actor: Actor, bookingId: string, branchId: string) {
    return confirmationContext(this.database, actor, bookingId, branchId, this.clock);
  }
  async authorize(transaction: Transaction, actor: Actor, branchId: string) {
    await lockInventoryScope(transaction, actor, branchId, 'booking_manage');
    await lockActor(transaction, actor, this.clock);
    return true;
  }
  list(actor: Actor, branchId: string, page: BranchBookingPageQuery) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      await lockInventoryScope(transaction, actor, branchId);
      await lockActor(transaction, actor, this.clock);
      return bookingPage(transaction, { branchId }, page, this.clock());
    });
  }
  async target(transaction: Transaction, bookingId: string, scope: Scope, requirePublic = false) {
    const condition = and(
      eq(bookings.id, bookingId),
      'customerUserId' in scope
        ? eq(bookings.customerUserId, scope.customerUserId)
        : eq(bookings.branchId, scope.branchId),
    );
    const [target] = await transaction.select().from(bookings).where(condition);
    if (!target) throw new DomainError('NOT_FOUND', 404, 'Booking unavailable');
    if (requirePublic) {
      await lockPublicInventory(
        transaction,
        target.branchId,
        bookingQuoteSnapshotSchema.parse(target.quoteSnapshot),
      );
    } else {
      await lockInventoryBranch(transaction, target.branchId);
      await transaction
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.id, target.roomId))
        .for('update');
    }
    await expireRoomReservations(transaction, target.roomId, this.clock());
    const [current] = await transaction.select().from(bookings).where(condition).for('update');
    if (!current) throw new DomainError('NOT_FOUND', 404, 'Booking unavailable');
    return current;
  }
  async authorizeCustomer(transaction: Transaction, actor: Actor, bookingId: string) {
    await this.target(transaction, bookingId, { customerUserId: actor.userId });
    await lockActor(transaction, actor, this.clock);
    return true;
  }
  async cancel(
    transaction: Transaction,
    actor: Actor,
    id: string,
    reason: string,
    branchId?: string,
  ) {
    const booking = await this.target(
      transaction,
      id,
      branchId ? { branchId } : { customerUserId: actor.userId },
    );
    await lockActor(transaction, actor, this.clock);
    if (booking.state !== 'pending_request' && booking.state !== 'confirmed')
      throw new DomainError('CONFLICT', 409, 'Booking is no longer cancellable');
    const [fulfilled] = await transaction
      .select({ id: stays.id })
      .from(stays)
      .where(
        and(
          eq(stays.bookingId, booking.id),
          eq(stays.branchId, booking.branchId),
          isNotNull(stays.checkedInAt),
        ),
      )
      .limit(1);
    if (fulfilled)
      throw new DomainError('CONFLICT', 409, 'Checked-in bookings use the Stay lifecycle');
    if (!branchId)
      requireCustomerCancellation(
        bookingQuoteSnapshotSchema.parse(booking.quoteSnapshot).policy,
        booking.moveInDate,
        this.clock(),
      );
    return this.transition(
      transaction,
      actor,
      booking,
      'cancelled',
      branchId ? 'hostel_cancelled' : 'customer_cancelled',
      reason,
    );
  }
  async reject(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    reason: string,
  ) {
    const booking = await this.target(transaction, id, { branchId });
    await lockActor(transaction, actor, this.clock);
    if (booking.state !== 'pending_request')
      throw new DomainError('CONFLICT', 409, 'Booking is not pending');
    return this.transition(transaction, actor, booking, 'rejected', 'hostel_rejected', reason);
  }
  // SRS v2.11 / BKG-002: approval of an upfront request opens payment without confirming.
  async approve(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    reason: string,
    expectedCustomerId: string,
  ) {
    const booking = await this.target(transaction, id, { branchId }, true);
    if (booking.customerUserId !== expectedCustomerId)
      throw new DomainError('CONFLICT', 409, 'Booking changed; retry approval');
    const [terms] = await transaction
      .select()
      .from(bookingUpfrontTerms)
      .where(eq(bookingUpfrontTerms.bookingId, id))
      .for('update');
    if (!terms)
      throw new DomainError('CONFLICT', 409, 'Requests without upfront payment are confirmed');
    if (terms.approvedAt) throw new DomainError('CONFLICT', 409, 'Payment was already requested');
    const { now } = await requireConfirmable(
      transaction,
      actor,
      booking,
      branchId,
      this.clock,
      this.bucket,
    );
    await transaction
      .update(bookingUpfrontTerms)
      .set({ approvedAt: now, approvedByUserId: actor.userId })
      .where(eq(bookingUpfrontTerms.bookingId, id));
    await this.record(
      transaction,
      actor,
      booking,
      'pending_request',
      'hostel_approved',
      reason,
      now,
    );
    return bookingProjection(transaction, booking, now);
  }
  async confirm(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    reason: string,
    expectedCustomerId: string,
  ) {
    const booking = await this.target(transaction, id, { branchId }, true);
    if (booking.customerUserId !== expectedCustomerId)
      throw new DomainError('CONFLICT', 409, 'Booking changed; retry confirmation');
    await requireVerifiedUpfront(transaction, booking);
    const { now } = await requireConfirmable(
      transaction,
      actor,
      booking,
      branchId,
      this.clock,
      this.bucket,
    );
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: now })
      .where(and(eq(inventoryClaims.bookingId, id), isNull(inventoryClaims.releasedAt)));
    await transaction
      .update(bookings)
      .set({ state: 'confirmed', updatedAt: now })
      .where(eq(bookings.id, id));
    const [ordinal] = booking.seatId
      ? await transaction
          .select({ value: seats.ordinal })
          .from(seats)
          .where(eq(seats.id, booking.seatId))
      : [];
    await transaction.insert(inventoryClaims).values({
      branchId,
      roomId: booking.roomId,
      seatId: booking.seatId,
      seatOrdinal: ordinal?.value ?? null,
      bookingId: id,
      moveInDate: booking.moveInDate,
      moveOutDate: booking.moveOutDate,
      createdAt: now,
    });
    await this.record(transaction, actor, booking, 'confirmed', 'hostel_confirmed', reason, now);
    return bookingProjection(transaction, { ...booking, state: 'confirmed', updatedAt: now }, now);
  }
  private async transition(
    transaction: Transaction,
    actor: Actor,
    booking: typeof bookings.$inferSelect,
    state: 'cancelled' | 'rejected',
    reasonCode: string,
    reason: string,
  ) {
    const now = this.clock();
    await transaction
      .update(bookings)
      .set({ state, updatedAt: now })
      .where(eq(bookings.id, booking.id));
    await transaction
      .update(inventoryClaims)
      .set({ releasedAt: now })
      .where(and(eq(inventoryClaims.bookingId, booking.id), isNull(inventoryClaims.releasedAt)));
    await this.record(transaction, actor, booking, state, reasonCode, reason, now);
    return bookingProjection(transaction, { ...booking, state, updatedAt: now }, now);
  }
  private async record(
    transaction: Transaction,
    actor: Actor,
    booking: typeof bookings.$inferSelect,
    state: 'confirmed' | 'rejected' | 'cancelled' | 'pending_request',
    reasonCode: string,
    reason: string,
    now: Date,
  ) {
    const [branch] = await transaction
      .select({ organizationId: branches.organizationId })
      .from(branches)
      .where(eq(branches.id, booking.branchId));
    if (!branch) throw new Error('Booking branch unavailable');
    await transaction.insert(bookingHistory).values({
      bookingId: booking.id,
      actorUserId: actor.userId,
      previousState: booking.state,
      nextState: state,
      reasonCode,
      createdAt: now,
    });
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: actor.userId === booking.customerUserId ? 'customer' : 'management',
      organizationId: branch.organizationId,
      branchId: booking.branchId,
      targetType: 'booking',
      targetId: booking.id,
      action: 'booking.' + reasonCode,
      before: { state: booking.state },
      after: { state, reason },
      createdAt: now,
    });
    const event = {
      confirmed: 'booking.confirmed',
      rejected: 'booking.rejected',
      cancelled: 'booking.cancelled',
      pending_request: 'booking.approved',
    } as const;
    await enqueueBookingLifecycle(transaction, { event: event[state], bookingId: booking.id }, now);
  }
}
