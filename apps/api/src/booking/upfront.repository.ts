import { and, eq, inArray } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  bookingHistory,
  bookingPaymentProofs,
  bookingUpfrontTerms,
  branches,
  branchSettings,
  enqueueBookingLifecycle,
  files,
  type bookings,
} from '@hsm/db';
import { DomainError, type BookingProofInput, type BookingProofReview } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { pakistanToday } from './policy.js';
import { bookingProjection } from './projection.js';
import type { BookingActionRepository } from './actions.repository.js';
type Booking = typeof bookings.$inferSelect;
export class BookingUpfrontRepository {
  constructor(
    private readonly actions: BookingActionRepository,
    private readonly bucket: string,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  // CHG-010: delegated financial review needs booking, payment-record and finance-read grants.
  async authorizeReviewer(transaction: Transaction, actor: Actor, branchId: string) {
    await lockActor(transaction, actor, this.clock);
    for (const permission of ['booking_manage', 'payment_record', 'finance_view'] as const)
      await lockInventoryScope(transaction, actor, branchId, permission);
    await lockActor(transaction, actor, this.clock);
    return true;
  }
  private async organization(transaction: Transaction, branchId: string) {
    const [branch] = await transaction
      .select({ organizationId: branches.organizationId })
      .from(branches)
      .where(eq(branches.id, branchId));
    if (!branch) throw new DomainError('NOT_FOUND', 404, 'Booking branch unavailable');
    return branch.organizationId;
  }
  private async lockTerms(transaction: Transaction, booking: Booking) {
    const [terms] = await transaction
      .select()
      .from(bookingUpfrontTerms)
      .where(eq(bookingUpfrontTerms.bookingId, booking.id))
      .for('update');
    if (!terms || terms.branchId !== booking.branchId)
      throw new DomainError('CONFLICT', 409, 'This booking has no upfront payment requirement');
    return terms;
  }
  private requireOpen(booking: Booking) {
    if (
      booking.state !== 'pending_request' ||
      !booking.requestExpiresAt ||
      booking.requestExpiresAt <= this.clock()
    )
      throw new DomainError('CONFLICT', 409, 'Booking request expired or already processed');
  }
  // ACC-004 / SEC-003: only the customer's own clean private payment proof may be submitted.
  private async ownProof(transaction: Transaction, actor: Actor, fileId: string) {
    const [file] = await transaction
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.uploadedBy, actor.userId),
          eq(files.bucket, this.bucket),
          eq(files.visibility, 'private'),
          eq(files.purpose, 'payment_proof'),
          eq(files.scanStatus, 'clean'),
        ),
      )
      .for('update');
    if (
      !file ||
      file.sha256?.length !== 32 ||
      !file.objectKey.startsWith('private/payment_proof/' + fileId + '/')
    )
      throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    const [used] = await transaction
      .select({ id: bookingPaymentProofs.id })
      .from(bookingPaymentProofs)
      .where(eq(bookingPaymentProofs.fileId, fileId));
    if (used) throw new DomainError('CONFLICT', 409, 'This proof file was already submitted');
    return file;
  }
  async submit(
    transaction: Transaction,
    actor: Actor,
    bookingId: string,
    input: BookingProofInput,
  ) {
    const booking = await this.actions.target(transaction, bookingId, {
      customerUserId: actor.userId,
    });
    this.requireOpen(booking);
    const terms = await this.lockTerms(transaction, booking);
    if (!terms.approvedAt)
      throw new DomainError('CONFLICT', 409, 'The hostel has not requested payment yet');
    const open = await transaction
      .select({ id: bookingPaymentProofs.id })
      .from(bookingPaymentProofs)
      .where(
        and(
          eq(bookingPaymentProofs.bookingId, booking.id),
          inArray(bookingPaymentProofs.state, ['submitted', 'approved']),
        ),
      )
      .for('update');
    if (open.length) throw new DomainError('CONFLICT', 409, 'A payment proof is already pending');
    const [settings] = await transaction
      .select({ retry: branchSettings.proofRetryAllowed })
      .from(branchSettings)
      .where(eq(branchSettings.branchId, booking.branchId));
    const [rejected] = await transaction
      .select({ id: bookingPaymentProofs.id })
      .from(bookingPaymentProofs)
      .where(
        and(
          eq(bookingPaymentProofs.bookingId, booking.id),
          eq(bookingPaymentProofs.state, 'rejected'),
        ),
      )
      .limit(1);
    if (rejected && settings?.retry === false)
      throw new DomainError('CONFLICT', 409, 'This hostel does not accept a replacement proof');
    const now = this.clock();
    if (BigInt(input.amountPaisa) !== terms.amountPaisa)
      throw new DomainError('VALIDATION_FAILED', 422, 'Submit the exact required upfront amount');
    if (input.paidOn > pakistanToday(now) || input.paidOn < pakistanToday(booking.createdAt))
      throw new DomainError('VALIDATION_FAILED', 422, 'Payment date must follow the request');
    await this.ownProof(transaction, actor, input.fileId);
    await lockActor(transaction, actor, this.clock);
    const id = v7();
    await transaction.insert(bookingPaymentProofs).values({
      id,
      bookingId: booking.id,
      branchId: booking.branchId,
      customerUserId: actor.userId,
      fileId: input.fileId,
      amountPaisa: terms.amountPaisa,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference,
      createdAt: now,
    });
    await this.history(transaction, actor, booking, 'customer', 'payment_proof_submitted', now, {
      proofId: id,
    });
    await enqueueBookingLifecycle(
      transaction,
      { event: 'booking.payment_submitted', bookingId: booking.id, proofId: id },
      now,
    );
    return bookingProjection(transaction, booking, now);
  }
  async review(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    bookingId: string,
    proofId: string,
    review: BookingProofReview,
    expectedCustomerId: string,
  ) {
    const booking = await this.actions.target(transaction, bookingId, { branchId }, true);
    this.requireOpen(booking);
    await this.lockTerms(transaction, booking);
    const [proof] = await transaction
      .select()
      .from(bookingPaymentProofs)
      .where(
        and(
          eq(bookingPaymentProofs.id, proofId),
          eq(bookingPaymentProofs.bookingId, booking.id),
          eq(bookingPaymentProofs.branchId, branchId),
        ),
      )
      .for('update');
    if (!proof) throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    if (proof.state !== 'submitted')
      throw new DomainError('CONFLICT', 409, 'Payment proof was already reviewed');
    await lockActor(transaction, actor, this.clock);
    const now = this.clock(),
      approved = review.decision === 'approve';
    await transaction
      .update(bookingPaymentProofs)
      .set({
        state: approved ? 'approved' : 'rejected',
        reviewedByUserId: actor.userId,
        reviewedAt: now,
        reviewReason: approved ? null : review.reason,
      })
      .where(eq(bookingPaymentProofs.id, proof.id));
    const action = approved ? 'payment_proof_approved' : 'payment_proof_rejected';
    await this.history(transaction, actor, booking, 'management', action, now, {
      proofId: proof.id,
      ...(approved ? {} : { reason: review.reason }),
    });
    if (!approved) {
      await enqueueBookingLifecycle(
        transaction,
        { event: 'booking.payment_rejected', bookingId: booking.id, proofId: proof.id },
        now,
      );
      return bookingProjection(transaction, booking, now);
    }
    // BKG-008: verification completes the reservation; confirmation revalidates everything.
    return this.actions.confirm(
      transaction,
      actor,
      branchId,
      booking.id,
      'Upfront payment verified',
      expectedCustomerId,
    );
  }
  private async history(
    transaction: Transaction,
    actor: Actor,
    booking: Booking,
    actorRole: 'customer' | 'management',
    action: string,
    now: Date,
    details: Record<string, unknown>,
  ) {
    await transaction.insert(bookingHistory).values({
      bookingId: booking.id,
      actorUserId: actor.userId,
      previousState: booking.state,
      nextState: booking.state,
      reasonCode: action,
      createdAt: now,
    });
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole,
      organizationId: await this.organization(transaction, booking.branchId),
      branchId: booking.branchId,
      targetType: 'booking',
      targetId: booking.id,
      action: 'booking.' + action,
      before: { state: booking.state },
      after: { state: booking.state, ...details },
      createdAt: now,
    });
  }
  // SEC-003: reviewers read the private proof through a short-lived, audited link.
  async proofFile(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    bookingId: string,
    proofId: string,
  ) {
    await this.authorizeReviewer(transaction, actor, branchId);
    const [row] = await transaction
      .select({ proof: bookingPaymentProofs, file: files })
      .from(bookingPaymentProofs)
      .innerJoin(files, eq(files.id, bookingPaymentProofs.fileId))
      .where(
        and(
          eq(bookingPaymentProofs.id, proofId),
          eq(bookingPaymentProofs.bookingId, bookingId),
          eq(bookingPaymentProofs.branchId, branchId),
          eq(files.scanStatus, 'clean'),
          eq(files.bucket, this.bucket),
          eq(files.purpose, 'payment_proof'),
        ),
      );
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Payment proof unavailable');
    await this.audit.sensitive(transaction, {
      actorUserId: actor.userId,
      subjectUserId: row.proof.customerUserId,
      resource: 'booking_payment_proof',
      resourceId: row.file.id,
      purpose: 'Upfront booking payment verification',
      createdAt: this.clock(),
    });
    return row.file;
  }
}
