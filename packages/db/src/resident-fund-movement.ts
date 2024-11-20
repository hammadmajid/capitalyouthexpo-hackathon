import { v7 } from 'uuid';
import { z } from 'zod';
import { residentFundMovements, residentLedger, hostelAuditLog } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { lockPaymentParty } from './resident-payment-context.js';
import { residentFundCommandSchema, type ResidentFundCommand } from './resident-fund-command.js';
import { requireFundSource, requireFundCapacity } from './resident-fund-context.js';
function entries(input: ResidentFundCommand, movementId: string, now: Date) {
  const { scope, movement } = input,
    common = {
      branchId: scope.branchId,
      stayId: scope.stayId,
      fundMovementId: movementId,
      fundingPaymentId: input.paymentId,
      amountPaisa: BigInt(movement.amountPaisa),
      postedAt: now,
    };
  const rows: (typeof residentLedger.$inferInsert)[] = [
    {
      ...common,
      id: v7(),
      account: movement.kind.startsWith('advance_') ? 'advance' : 'deposit',
      side: 'debit',
    },
  ];
  if ('invoiceId' in movement)
    rows.push({
      ...common,
      id: v7(),
      account: 'receivable',
      side: 'credit',
      invoiceId: movement.invoiceId,
    });
  return rows;
}
// Internal command: caller owns live finance_view and explicit authorized fund-operation scope, sorted identity
// locks, idempotency and mandatory notices. External refund is a recorded hostel act,
// never an HSM money transfer. Required writes use the exact caller transaction.
export async function recordResidentFundMovement(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
) {
  const input = residentFundCommandSchema.parse(value),
    now = z.date().parse(clock),
    { scope, movement } = input;
  const party = await lockPaymentParty(tx, scope),
    sourceKey = await requireFundSource(tx, input);
  await requireFundCapacity(tx, input, now);
  const id = v7();
  await writeMovement(tx, input, id, sourceKey, now);
  await tx.insert(residentLedger).values(entries(input, id, now));
  await writeAudit(tx, input, id, party.organizationId, now);
  return {
    movementId: id,
    paymentId: input.paymentId,
    kind: movement.kind,
    amountPaisa: movement.amountPaisa,
  };
}

async function writeMovement(
  tx: PostingTransaction,
  input: ResidentFundCommand,
  id: string,
  sourceKey: string,
  now: Date,
) {
  const { scope, movement } = input;
  await tx.insert(residentFundMovements).values({
    id,
    branchId: scope.branchId,
    stayId: scope.stayId,
    paymentId: input.paymentId,
    invoiceId: 'invoiceId' in movement ? movement.invoiceId : null,
    kind: movement.kind,
    sourceKey,
    amountPaisa: BigInt(movement.amountPaisa),
    reason: movement.reason,
    externalReference:
      'externalReference' in movement ? (movement.externalReference ?? null) : null,
    postedByUserId: scope.actorUserId,
    postedAt: now,
  });
}
async function writeAudit(
  tx: PostingTransaction,
  input: ResidentFundCommand,
  id: string,
  organizationId: string,
  now: Date,
) {
  const { scope, movement } = input;
  await tx.insert(hostelAuditLog).values({
    organizationId,
    branchId: scope.branchId,
    actorUserId: scope.actorUserId,
    actorRole: scope.actorRole,
    action: 'resident.fund.recorded',
    targetType: 'resident_fund_movement',
    targetId: id,
    after: {
      paymentId: input.paymentId,
      kind: movement.kind,
      amountPaisa: movement.amountPaisa,
      reason: movement.reason,
    },
    createdAt: now,
  });
}
