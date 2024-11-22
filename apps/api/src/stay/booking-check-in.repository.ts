import { and, eq, isNull, or } from 'drizzle-orm';
import {
  billingPolicies,
  bookings,
  branches,
  checkInConfirmedBooking,
  rooms,
  users,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  bookingAdmissionResultSchema,
  bookingQuoteSnapshotSchema,
  type BookingAdmissionCommand,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import type { IdempotencyStore } from '../idempotency/store.js';
import { IdempotencyRepository } from '../idempotency/repository.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockParticipants } from '../management/identity-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { billingPolicyVersion } from './billing-policy.repository.js';
import { snapshotBookingAdmissionTerms } from './booking-admission-terms.js';
import { cnicFingerprint, requireProtector, type CnicProtector } from './resident-cnic.js';
// CHG-010: check-in creates a Stay and its financial terms, so it needs the same live
// stay_manage, rent_manage and finance_view grants as manual admission.
async function lockCheckInAuthority(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  clock: () => Date,
) {
  await lockActor(tx, actor, clock);
  await lockInventoryScope(tx, actor, branchId, 'stay_manage');
  await lockInventoryScope(tx, actor, branchId, 'rent_manage');
  const scope = await lockInventoryScope(tx, actor, branchId, 'finance_view');
  await lockActor(tx, actor, clock);
  return scope;
}
export class BookingCheckInRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
    private readonly protect?: CnicProtector,
  ) {}
  // CHG-054: the idempotency fingerprint carries the keyed CNIC hash, never the number.
  fingerprint(command: BookingAdmissionCommand) {
    return cnicFingerprint(command.cnic, this.protect);
  }
  // CHG-054: only whether the booking customer's account holds a CNIC, never the number.
  async cnicOnFile(tx: Transaction, branchId: string, bookingId: string) {
    const [row] = await tx
      .select({ last4: users.cnicLast4 })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.customerUserId))
      .where(and(eq(bookings.id, bookingId), eq(bookings.branchId, branchId)));
    return Boolean(row?.last4);
  }
  // Resolve the booking Customer under live authority, then lock both identities in order.
  async context(actor: Actor, branchId: string, bookingId: string) {
    const customerUserId = await this.database.transaction(async (tx) => {
      await lockCheckInAuthority(tx, actor, branchId, this.clock);
      const [booking] = await tx
        .select({ customerUserId: bookings.customerUserId })
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.branchId, branchId)));
      if (!booking) throw new DomainError('NOT_FOUND', 404, 'Booking unavailable');
      return booking.customerUserId;
    });
    const store: IdempotencyStore = new IdempotencyRepository(this.database, (tx, current, now) =>
      lockParticipants(tx, current, customerUserId, () => now),
    );
    return { store, customerUserId };
  }
  async authorize(tx: Transaction, actor: Actor, branchId: string) {
    await lockCheckInAuthority(tx, actor, branchId, this.clock);
    return true;
  }
  // BKG-004 / RENT-003: agreement terms come only from the booking's captured quote and the
  // explicitly selected current billing policy version.
  async terms(tx: Transaction, branchId: string, bookingId: string, requested?: string) {
    const [row] = await tx
      .select({
        quote: bookings.quoteSnapshot,
        brandId: branches.brandId,
        roomTypeId: rooms.roomTypeId,
      })
      .from(bookings)
      .innerJoin(branches, eq(branches.id, bookings.branchId))
      .innerJoin(rooms, and(eq(rooms.id, bookings.roomId), eq(rooms.branchId, bookings.branchId)))
      .where(and(eq(bookings.id, bookingId), eq(bookings.branchId, branchId)));
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Booking unavailable');
    const quote = bookingQuoteSnapshotSchema.parse(row.quote);
    const policyVersionId =
      requested ?? (await this.effectivePolicyId(tx, branchId, row.brandId, row.roomTypeId));
    const [policy] = await tx
      .select()
      .from(billingPolicies)
      .where(eq(billingPolicies.id, policyVersionId));
    if (!policy) throw new DomainError('CONFLICT', 409, 'Billing settings changed; reload');
    const version = billingPolicyVersion(policy);
    return snapshotBookingAdmissionTerms(
      {
        branchId,
        brandId: row.brandId,
        roomTypeId: row.roomTypeId,
        policyVersionId,
        target: quote.target,
        range: quote.range,
      },
      quote,
      version,
    );
  }
  // RENT-003: the current most specific policy (room type, branch, hostel, platform).
  private async effectivePolicyId(
    tx: Transaction,
    branchId: string,
    brandId: string,
    roomTypeId: string,
  ) {
    const rows = await tx
      .select()
      .from(billingPolicies)
      .where(
        and(
          eq(billingPolicies.isCurrent, true),
          or(
            and(isNull(billingPolicies.brandId), isNull(billingPolicies.branchId)),
            eq(billingPolicies.brandId, brandId),
            and(
              eq(billingPolicies.branchId, branchId),
              or(isNull(billingPolicies.roomTypeId), eq(billingPolicies.roomTypeId, roomTypeId)),
            ),
          ),
        ),
      )
      .limit(5);
    const rank = (row: (typeof rows)[number]) =>
      row.roomTypeId ? 3 : row.branchId ? 2 : row.brandId ? 1 : 0;
    const effective = rows.sort((left, right) => rank(right) - rank(left))[0];
    if (!effective) throw new DomainError('CONFLICT', 409, 'Configure billing settings first');
    return effective.id;
  }
  async checkIn(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    bookingId: string,
    command: BookingAdmissionCommand,
    customerUserId: string,
  ) {
    const scope = await lockCheckInAuthority(tx, actor, branchId, this.clock);
    const { terms } = await this.terms(tx, branchId, bookingId, command.policyVersionId);
    const result = await checkInConfirmedBooking(
      tx,
      {
        scope: {
          organizationId: scope.organizationId,
          branchId,
          actorUserId: actor.userId,
          actorRole: scope.actorRole,
        },
        bookingId,
        terms,
        initialBilling: command.initialBilling,
        cnic: command.cnic === undefined ? null : requireProtector(this.protect)(command.cnic),
      },
      this.clock(),
      async (sourceTx, input, bookingCustomer) => {
        if (
          sourceTx !== tx ||
          input.scope.branchId !== branchId ||
          input.scope.actorUserId !== actor.userId ||
          bookingCustomer !== customerUserId
        )
          throw new DomainError('CONFLICT', 409, 'Booking changed; reload check-in');
        await lockCheckInAuthority(sourceTx, actor, branchId, this.clock);
      },
    );
    return bookingAdmissionResultSchema.parse({ branchId, ...result });
  }
}
