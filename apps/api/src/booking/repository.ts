import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  enqueueBookingLifecycle,
  bookingHolds,
  branches,
  bookings,
  inventoryClaims,
  bookingHistory,
  bookingDocuments,
  bookingPolicies,
  expireRoomReservations,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  bookingQuoteSnapshotSchema,
  bookingPlatformLimitsSchema,
  holdResponseSchema,
  type QuoteInput,
  type CreateBookingInput,
  type BookingQuoteSnapshot,
  type ManagementPage,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { AuthCrypto } from '../auth/crypto.js';
import { lockActor } from '../auth/actor-lock.js';
import { currentInventoryQuote, lockPublicInventory } from './quote.js';
import { requireInventoryAvailable } from './availability.js';
import { requireBookingCustomer, bookingEvidence } from './evidence.js';
import { branchUpfrontRequirement, captureUpfrontTerms } from './upfront.js';
import { requireMatchingQuote, requireStayPolicy } from './policy.js';
import { requireBookingCategory } from './category.policy.js';
import { requireBookingAddress } from './address.js';
import { consumeEvidence } from './evidence-selection.js';
import { bookingPage, bookingProjection, publicBranch } from './projection.js';
export class BookingRepository {
  constructor(
    readonly database: Database,
    private readonly bucket: string,
    private readonly crypto: Pick<AuthCrypto, 'protectCnic' | 'equals'>,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(transaction: Transaction, actor: Actor, branchId?: string) {
    await lockActor(transaction, actor, this.clock);
    const gender = await requireBookingCustomer(transaction, actor);
    if (branchId) {
      if (!(await publicBranch(transaction, branchId)))
        throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
      const [branch] = await transaction
        .select({ category: branches.category })
        .from(branches)
        .where(eq(branches.id, branchId));
      if (!branch) throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
      requireBookingCategory(gender, branch.category);
    }
    return true;
  }
  quote(branchId: string, input: QuoteInput) {
    return this.database.transaction(async (transaction) => {
      const result = await currentInventoryQuote(transaction, branchId, input, this.clock);
      await requireInventoryAvailable(transaction, result.quote, this.clock());
      return result.quote;
    });
  }
  list(actor: Actor, page: ManagementPage) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      await this.authorize(transaction, actor);
      return bookingPage(transaction, { customerUserId: actor.userId }, page, this.clock());
    });
  }
  async hold(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    expected: BookingQuoteSnapshot,
  ) {
    const { inventory, quote } = await currentInventoryQuote(
      transaction,
      branchId,
      expected,
      this.clock,
    );
    await lockActor(transaction, actor, this.clock);
    const gender = await requireBookingCustomer(transaction, actor);
    requireBookingCategory(gender, inventory.branch.category);
    const now = this.clock();
    requireStayPolicy(quote, now);
    requireMatchingQuote(expected, quote);
    if (quote.policy.holdSeconds === 0)
      throw new DomainError('CONFLICT', 409, 'This policy does not use holds');
    await expireRoomReservations(transaction, inventory.room.id, now);
    await requireInventoryAvailable(transaction, quote, now);
    await this.requireHoldLimit(transaction, actor, now);
    const id = v7(),
      expiresAt = new Date(now.getTime() + quote.policy.holdSeconds * 1000);
    await transaction.insert(bookingHolds).values({
      id,
      branchId,
      roomId: inventory.room.id,
      seatId: inventory.seat?.id ?? null,
      customerUserId: actor.userId,
      ...quote.range,
      quoteSnapshot: quote,
      policyVersionId: quote.policyVersion,
      expiresAt,
      createdAt: now,
    });
    await transaction.insert(inventoryClaims).values({
      branchId,
      roomId: inventory.room.id,
      seatId: inventory.seat?.id ?? null,
      seatOrdinal: inventory.seat?.ordinal ?? null,
      holdId: id,
      ...quote.range,
      expiresAt,
      createdAt: now,
    });
    await this.record(
      transaction,
      actor,
      inventory.branch,
      id,
      'booking_hold',
      'booking.hold.created',
      now,
    );
    return holdResponseSchema.parse({ id, branchId, quote, expiresAt: expiresAt.toISOString() });
  }
  private async requireHoldLimit(transaction: Transaction, actor: Actor, now: Date) {
    const [platform] = await transaction
      .select({ limits: bookingPolicies.platformLimits })
      .from(bookingPolicies)
      .where(
        and(
          eq(bookingPolicies.isCurrent, true),
          isNull(bookingPolicies.brandId),
          isNull(bookingPolicies.branchId),
        ),
      );
    const limits = bookingPlatformLimitsSchema.parse(platform?.limits);
    const [active] = await transaction
      .select({ total: count() })
      .from(bookingHolds)
      .where(
        and(
          eq(bookingHolds.customerUserId, actor.userId),
          isNull(bookingHolds.releasedAt),
          gt(bookingHolds.expiresAt, now),
        ),
      );
    if ((active?.total ?? 0) >= limits.maximumActiveHolds)
      throw new DomainError('CONFLICT', 409, 'Active hold limit reached');
  }
  private async terms(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    input: CreateBookingInput,
  ) {
    if (!input.holdId) {
      const current = await currentInventoryQuote(transaction, branchId, input.quote, this.clock);
      requireMatchingQuote(input.quote, current.quote);
      return { ...current, hold: undefined };
    }
    const inventory = await lockPublicInventory(transaction, branchId, input.quote);
    await expireRoomReservations(transaction, inventory.room.id, this.clock());
    const [hold] = await transaction
      .select()
      .from(bookingHolds)
      .where(
        and(
          eq(bookingHolds.id, input.holdId),
          eq(bookingHolds.customerUserId, actor.userId),
          eq(bookingHolds.branchId, branchId),
          eq(bookingHolds.roomId, inventory.room.id),
        ),
      )
      .for('update');
    if (!hold) throw new DomainError('NOT_FOUND', 404, 'Hold unavailable');
    const now = this.clock();
    if (hold.releasedAt || hold.expiresAt <= now)
      throw new DomainError('CONFLICT', 409, 'Hold expired or already consumed');
    const quote = bookingQuoteSnapshotSchema.parse(hold.quoteSnapshot);
    requireMatchingQuote(input.quote, quote);
    requireStayPolicy(quote, now);
    return { inventory, quote, hold };
  }
  async create(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    input: CreateBookingInput,
  ) {
    const { inventory, quote, hold } = await this.terms(transaction, actor, branchId, input);
    // SRS v2.11: an upfront requirement keeps even instant bookings pending until verified.
    const upfront =
      (await branchUpfrontRequirement(transaction, branchId)) !== 'none' ||
      Boolean(quote.transportRequested && quote.transportOffer?.monthlyChargePaisa);
    const evidence = await bookingEvidence(
      transaction,
      actor,
      branchId,
      quote,
      input,
      this.bucket,
      this.crypto,
    );
    await lockActor(transaction, actor, this.clock);
    const gender = await requireBookingCustomer(transaction, actor);
    requireBookingCategory(gender, inventory.branch.category);
    await requireBookingAddress(transaction, actor.userId, input.permanentAddress);
    const now = this.clock();
    if (hold && (hold.releasedAt || hold.expiresAt <= now))
      throw new DomainError('CONFLICT', 409, 'Hold expired or already consumed');
    requireStayPolicy(quote, now);
    await expireRoomReservations(transaction, inventory.room.id, now);
    await requireInventoryAvailable(transaction, quote, now, hold?.id);
    const [active] = await transaction
      .select({ total: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.customerUserId, actor.userId),
          eq(bookings.state, 'pending_request'),
          gt(bookings.requestExpiresAt, now),
        ),
      );
    const id = v7(),
      state = quote.policy.bookingMode === 'instant' && !upfront ? 'confirmed' : 'pending_request';
    if (state === 'pending_request' && (active?.total ?? 0) >= 3)
      throw new DomainError('CONFLICT', 409, 'Three active booking requests already exist');
    const requestExpiresAt =
      state === 'pending_request'
        ? new Date(now.getTime() + quote.policy.requestExpirySeconds * 1000)
        : null;
    if (hold) {
      await transaction
        .update(bookingHolds)
        .set({ releasedAt: now })
        .where(eq(bookingHolds.id, hold.id));
      await transaction
        .update(inventoryClaims)
        .set({ releasedAt: now })
        .where(and(eq(inventoryClaims.holdId, hold.id), isNull(inventoryClaims.releasedAt)));
    }
    const [booking] = await transaction
      .insert(bookings)
      .values({
        id,
        branchId,
        roomId: inventory.room.id,
        seatId: inventory.seat?.id ?? null,
        customerUserId: actor.userId,
        holdId: hold?.id ?? null,
        ...quote.range,
        quoteSnapshot: quote,
        policyVersionId: quote.policyVersion,
        state,
        requestExpiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!booking) throw new Error('Booking creation failed');
    const captured = await captureUpfrontTerms(transaction, booking, quote, now);
    if (state === 'confirmed' || quote.policy.requestReservesInventory)
      await transaction.insert(inventoryClaims).values({
        branchId,
        roomId: inventory.room.id,
        seatId: inventory.seat?.id ?? null,
        seatOrdinal: inventory.seat?.ordinal ?? null,
        bookingId: id,
        ...quote.range,
        expiresAt: requestExpiresAt,
        createdAt: now,
      });
    if (evidence.length)
      await transaction.insert(bookingDocuments).values(
        evidence.map((document) => ({
          kind: document.kind,
          fileId: document.fileId,
          state: document.state,
          reviewedByUserId: document.reviewedByUserId,
          reviewedAt: document.reviewedAt,
          bookingId: id,
          branchId,
          customerUserId: actor.userId,
          createdAt: now,
        })),
      );
    const consumedSources = await consumeEvidence(transaction, actor, branchId, evidence, now);
    for (const sourceId of consumedSources)
      await this.audit.hostel(transaction, {
        actorUserId: actor.userId,
        actorRole: 'customer',
        organizationId: inventory.branch.organizationId,
        branchId,
        targetType: 'booking_document',
        targetId: sourceId,
        action: 'booking.document.consumed',
        after: { bookingId: id },
        createdAt: now,
      });
    await transaction.insert(bookingHistory).values({
      bookingId: id,
      actorUserId: actor.userId,
      nextState: state,
      reasonCode: 'customer_submitted',
      createdAt: now,
    });
    await this.record(transaction, actor, inventory.branch, id, 'booking', 'booking.created', now);
    await enqueueBookingLifecycle(transaction, { event: 'booking.submitted', bookingId: id }, now);
    if (captured && quote.policy.bookingMode === 'instant')
      await enqueueBookingLifecycle(transaction, { event: 'booking.approved', bookingId: id }, now);
    if (state === 'confirmed')
      await enqueueBookingLifecycle(
        transaction,
        { event: 'booking.confirmed', bookingId: id },
        now,
      );
    return bookingProjection(transaction, booking, now);
  }
  private record(
    transaction: Transaction,
    actor: Actor,
    branch: { id: string; organizationId: string },
    id: string,
    type: 'booking' | 'booking_hold',
    action: string,
    now: Date,
  ) {
    return this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: 'customer',
      organizationId: branch.organizationId,
      branchId: branch.id,
      targetType: type,
      targetId: id,
      action,
      after: { created: true },
      createdAt: now,
    });
  }
}
