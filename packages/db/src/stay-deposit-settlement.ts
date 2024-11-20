import { v7 } from 'uuid';
import { DomainError } from '@hsm/contracts';
import type { PostingTransaction } from './resident-posting-context.js';
import { recordResidentFundMovement } from './resident-fund-movement.js';
import { stayFundSources, stayInvoiceBalances } from './stay-financial-pages.js';
type Actor = {
  branchId: string;
  stayId: string;
  actorUserId: string;
  actorRole: 'owner' | 'manager';
};
// P9-FIX-03 / OUT-003/004: inside the checkout transaction, held security deposit is applied
// to the Stay's own open invoices, oldest due first, up to the outstanding amount. Each step
// is an ordinary recorded deposit_apply movement (source capacity and invoice balance are
// re-checked by the movement command), so the deposit can never be applied twice, used for
// another Stay, or exceed what is owed. Whatever remains stays held for a recorded refund.
export async function applyDepositAtCheckout(
  tx: PostingTransaction,
  actor: Actor,
  input: { today: string; reason: string },
  now: Date,
) {
  const scope = { branchId: actor.branchId, stayId: actor.stayId };
  const sources = stayFundSources(tx, scope);
  let current = await sources.next(),
    remaining = current.done ? 0 : current.value.depositPaisa;
  const applied: { paymentId: string; invoiceId: string; amountPaisa: number }[] = [];
  for await (const invoice of stayInvoiceBalances(tx, { ...scope, today: input.today })) {
    let due = invoice.outstandingPaisa;
    while (due > 0) {
      if (current.done) return applied;
      if (remaining <= 0) {
        current = await sources.next();
        remaining = current.done ? 0 : current.value.depositPaisa;
        continue;
      }
      // Existing response contract permits 400 movements. Fail atomically rather
      // than silently stop applying funds or return an invalid committed result.
      if (applied.length === 400)
        throw new DomainError(
          'CONFLICT',
          409,
          'Record deposit applications before completing this large checkout',
        );
      const source = current.value;
      const amountPaisa = Math.min(remaining, due);
      await recordResidentFundMovement(
        tx,
        {
          scope: actor,
          paymentId: source.paymentId,
          commandId: v7(),
          movement: {
            kind: 'deposit_apply',
            amountPaisa,
            reason: input.reason,
            invoiceId: invoice.invoiceId,
          },
        },
        now,
      );
      remaining -= amountPaisa;
      due -= amountPaisa;
      applied.push({ paymentId: source.paymentId, invoiceId: invoice.invoiceId, amountPaisa });
    }
  }
  return applied;
}
