import { and, eq } from 'drizzle-orm';
import { DomainError } from '@hsm/contracts';
import {
  residentPayments,
  residentPaymentReversals,
  residentFundMovements,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import type { ResidentFundCommand } from './resident-fund-command.js';
import { readResidentFundBalance } from './resident-fund-balance.js';
import { readResidentInvoiceBalance } from './resident-invoice-balance.js';
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
export async function requireFundSource(tx: PostingTransaction, input: ResidentFundCommand) {
  const { scope, paymentId } = input;
  const [payment] = await tx
    .select({
      id: residentPayments.id,
      branchId: residentPayments.branchId,
      stayId: residentPayments.stayId,
    })
    .from(residentPayments)
    .where(
      and(
        eq(residentPayments.branchId, scope.branchId),
        eq(residentPayments.stayId, scope.stayId),
        eq(residentPayments.id, paymentId),
      ),
    )
    .for('update');
  if (!payment) throw new DomainError('NOT_FOUND', 404, 'Funding payment unavailable');
  if (
    payment.id !== paymentId ||
    payment.branchId !== scope.branchId ||
    payment.stayId !== scope.stayId
  )
    throw new DomainError('INTERNAL', 500, 'Funding payment scope unavailable');
  const [reversed] = await tx
    .select({ id: residentPaymentReversals.id })
    .from(residentPaymentReversals)
    .where(
      and(
        eq(residentPaymentReversals.branchId, scope.branchId),
        eq(residentPaymentReversals.stayId, scope.stayId),
        eq(residentPaymentReversals.paymentId, paymentId),
      ),
    )
    .limit(1);
  if (reversed) conflict('Reversed payment cannot fund a new movement');
  const sourceKey = 'fund_movement:' + input.commandId;
  const [previous] = await tx
    .select({ id: residentFundMovements.id })
    .from(residentFundMovements)
    .where(
      and(
        eq(residentFundMovements.branchId, scope.branchId),
        eq(residentFundMovements.stayId, scope.stayId),
        eq(residentFundMovements.sourceKey, sourceKey),
      ),
    )
    .limit(1);
  if (previous) conflict('Fund command already recorded');
  return sourceKey;
}
export async function requireFundCapacity(
  tx: PostingTransaction,
  input: ResidentFundCommand,
  now: Date,
) {
  const { scope, paymentId, movement } = input;
  const balance = await readResidentFundBalance(tx, {
    branchId: scope.branchId,
    stayId: scope.stayId,
    paymentId,
  });
  const available = movement.kind.startsWith('advance_')
    ? balance.advance.availablePaisa
    : balance.deposit.heldPaisa;
  if (BigInt(movement.amountPaisa) > BigInt(available))
    conflict('Movement exceeds available funds from this payment');
  if ('invoiceId' in movement) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const invoice = await readResidentInvoiceBalance(tx, {
      branchId: scope.branchId,
      stayId: scope.stayId,
      invoiceId: movement.invoiceId,
      today,
    });
    if (
      invoice.state === 'voided' ||
      BigInt(movement.amountPaisa) > BigInt(invoice.outstandingPaisa)
    )
      conflict('Fund application exceeds invoice outstanding');
  }
}
