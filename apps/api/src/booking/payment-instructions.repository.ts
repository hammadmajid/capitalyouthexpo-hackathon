import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import { bookingUpfrontTerms, bookings, branchPaymentInstructions, type Database } from '@hsm/db';
import {
  DomainError,
  paymentInstructionListSchema,
  paymentInstructionSchema,
  type PaymentInstructionInput,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
type Row = typeof branchPaymentInstructions.$inferSelect;
export function projectInstruction(row: Row) {
  return paymentInstructionSchema.parse({
    id: row.id,
    branchId: row.branchId,
    method: row.method,
    accountTitle: row.accountTitle,
    accountIdentifier: row.accountIdentifier,
    instructions: row.instructions,
    createdAt: row.createdAt.toISOString(),
  });
}
export async function currentInstructions(database: Transaction, branchId: string) {
  return database
    .select()
    .from(branchPaymentInstructions)
    .where(
      and(
        eq(branchPaymentInstructions.branchId, branchId),
        isNull(branchPaymentInstructions.archivedAt),
      ),
    )
    .orderBy(asc(branchPaymentInstructions.createdAt), asc(branchPaymentInstructions.id))
    .limit(11);
}
// BKG-007 / BR-01: hostel-owned payment destinations; the platform never receives money.
export class PaymentInstructionRepository {
  constructor(
    private readonly database: Database,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorizeOwner(transaction: Transaction, actor: Actor, branchId: string) {
    await lockActor(transaction, actor, this.clock);
    const scope = await lockInventoryScope(transaction, actor, branchId, undefined, true);
    await lockActor(transaction, actor, this.clock);
    return scope;
  }
  list(actor: Actor, branchId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      await lockInventoryScope(transaction, actor, branchId, 'booking_manage');
      await lockActor(transaction, actor, this.clock);
      const rows = await currentInstructions(transaction, branchId);
      return paymentInstructionListSchema.parse({ branchId, data: rows.map(projectInstruction) });
    });
  }
  async create(
    transaction: Transaction,
    actor: Actor,
    branchId: string,
    input: PaymentInstructionInput,
  ) {
    const scope = await this.authorizeOwner(transaction, actor, branchId);
    const [active] = await transaction
      .select({ total: count() })
      .from(branchPaymentInstructions)
      .where(
        and(
          eq(branchPaymentInstructions.branchId, branchId),
          isNull(branchPaymentInstructions.archivedAt),
        ),
      );
    if ((active?.total ?? 0) >= 10)
      throw new DomainError('CONFLICT', 409, 'Archive an instruction before adding another');
    const now = this.clock(),
      id = v7();
    const [row] = await transaction
      .insert(branchPaymentInstructions)
      .values({ id, branchId, ...input, createdByUserId: actor.userId, createdAt: now })
      .returning();
    if (!row) throw new Error('Payment instruction insert failed');
    const value = projectInstruction(row);
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      targetType: 'branch_payment_instruction',
      targetId: id,
      action: 'booking.payment_instruction.created',
      before: null,
      after: { method: value.method },
      createdAt: now,
    });
    return value;
  }
  async archive(transaction: Transaction, actor: Actor, branchId: string, id: string) {
    const scope = await this.authorizeOwner(transaction, actor, branchId);
    const [row] = await transaction
      .select()
      .from(branchPaymentInstructions)
      .where(
        and(eq(branchPaymentInstructions.id, id), eq(branchPaymentInstructions.branchId, branchId)),
      )
      .for('update');
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Payment instruction unavailable');
    if (row.archivedAt) throw new DomainError('CONFLICT', 409, 'Payment instruction is archived');
    const now = this.clock();
    await transaction
      .update(branchPaymentInstructions)
      .set({ archivedAt: now })
      .where(eq(branchPaymentInstructions.id, id));
    await this.audit.hostel(transaction, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      targetType: 'branch_payment_instruction',
      targetId: id,
      action: 'booking.payment_instruction.archived',
      before: { archivedAt: null },
      after: { archivedAt: now.toISOString() },
      createdAt: now,
    });
    return projectInstruction({ ...row, archivedAt: now });
  }
  // SEC-003: only the booking customer, after payment is requested, sees where to pay.
  forCustomer(actor: Actor, bookingId: string) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      const [booking] = await transaction
        .select({
          branchId: bookings.branchId,
          state: bookings.state,
          expiresAt: bookings.requestExpiresAt,
          approvedAt: bookingUpfrontTerms.approvedAt,
        })
        .from(bookings)
        .innerJoin(bookingUpfrontTerms, eq(bookingUpfrontTerms.bookingId, bookings.id))
        .where(and(eq(bookings.id, bookingId), eq(bookings.customerUserId, actor.userId)));
      if (!booking) throw new DomainError('NOT_FOUND', 404, 'Booking unavailable');
      if (
        booking.state !== 'pending_request' ||
        !booking.approvedAt ||
        !booking.expiresAt ||
        booking.expiresAt <= this.clock()
      )
        throw new DomainError('CONFLICT', 409, 'Payment is not requested for this booking');
      const rows = await currentInstructions(transaction, booking.branchId);
      return paymentInstructionListSchema.parse({
        branchId: booking.branchId,
        data: rows.slice(0, 10).map(projectInstruction),
      });
    });
  }
}
