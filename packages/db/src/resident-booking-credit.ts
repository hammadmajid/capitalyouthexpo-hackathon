import { and, asc, eq, inArray } from 'drizzle-orm';
import { bookingQuoteSnapshotSchema, DomainError } from '@hsm/contracts';
import {
  bookingPaymentProofs,
  bookingUpfrontTerms,
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  sensitiveAccessLog,
} from './schema/index.js';
import { readResidentInvoiceBalance } from './resident-invoice-balance.js';
import { recordExternalResidentPayment } from './resident-payment.js';
import type { ManualAdmissionContext } from './resident-manual-admission.js';
import type { PostingTransaction } from './resident-posting-context.js';

// BKG-007/008 / PAY-008: carry verified money into the new Stay once, not a second collection.
export async function creditBookingPayment(tx: PostingTransaction, c: ManualAdmissionContext) {
  if (!c.booking?.proofId) return;
  const [proof] = await tx
    .select()
    .from(bookingPaymentProofs)
    .where(
      and(
        eq(bookingPaymentProofs.id, c.booking.proofId),
        eq(bookingPaymentProofs.bookingId, c.booking.id),
        eq(bookingPaymentProofs.branchId, c.input.scope.branchId),
        eq(bookingPaymentProofs.state, 'approved'),
      ),
    );
  const [terms] = await tx
    .select()
    .from(bookingUpfrontTerms)
    .where(eq(bookingUpfrontTerms.bookingId, c.booking.id));
  if (
    !proof ||
    !terms ||
    terms.amountPaisa !== proof.amountPaisa ||
    terms.branchId !== c.input.scope.branchId ||
    proof.customerUserId !== terms.customerUserId ||
    proof.customerUserId !== c.party.userId
  )
    throw new DomainError('CONFLICT', 409, 'Verified booking payment is unavailable');
  const quote = bookingQuoteSnapshotSchema.parse(c.booking.snapshot);
  const deposit = ['none', 'first_rent'].includes(terms.requirement)
    ? 0n
    : BigInt(quote.price.depositPaisa);
  let rent = ['first_rent', 'deposit_and_first_rent'].includes(terms.requirement)
    ? BigInt(quote.price.monthlyRentPaisa)
    : 0n;
  let transport = quote.transportRequested
    ? BigInt(quote.transportOffer?.monthlyChargePaisa ?? 0)
    : 0n;
  if (proof.amountPaisa !== deposit + rent + transport)
    throw new DomainError('CONFLICT', 409, 'Booking payment does not match captured components');
  const bills = await tx
    .selectDistinct({
      id: residentInvoices.id,
      due: residentInvoices.dueDate,
      kind: residentCharges.kind,
    })
    .from(residentInvoices)
    .innerJoin(residentInvoiceCharges, eq(residentInvoiceCharges.invoiceId, residentInvoices.id))
    .innerJoin(residentCharges, eq(residentCharges.id, residentInvoiceCharges.chargeId))
    .where(
      and(
        eq(residentInvoices.branchId, c.input.scope.branchId),
        eq(residentInvoices.stayId, c.stayId),
        inArray(residentCharges.kind, ['rent', 'transport']),
        eq(residentInvoices.state, 'issued'),
      ),
    )
    .orderBy(asc(residentInvoices.dueDate), asc(residentInvoices.id));
  const allocations: { invoiceId: string; amountPaisa: number }[] = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(c.now);
  const groups = new Map<string, Set<string>>();
  for (const bill of bills) {
    const kinds = groups.get(bill.id) ?? new Set<string>();
    kinds.add(bill.kind);
    groups.set(bill.id, kinds);
  }
  for (const [invoiceId, kinds] of groups) {
    const balance = await readResidentInvoiceBalance(tx, {
      branchId: c.input.scope.branchId,
      stayId: c.stayId,
      invoiceId,
      today,
    });
    const rentBudget = kinds.has('rent') ? rent : 0n;
    const transportBudget = kinds.has('transport') ? transport : 0n;
    const budget = rentBudget + transportBudget;
    const amount =
      budget < BigInt(balance.outstandingPaisa) ? budget : BigInt(balance.outstandingPaisa);
    if (amount > 0n) allocations.push({ invoiceId, amountPaisa: Number(amount) });
    const towardsRent = rentBudget < amount ? rentBudget : amount;
    rent -= towardsRent;
    transport -= amount - towardsRent;
  }
  await recordExternalResidentPayment(
    tx,
    {
      scope: {
        branchId: c.input.scope.branchId,
        stayId: c.stayId,
        actorUserId: c.input.scope.actorUserId,
        actorRole: c.input.scope.actorRole,
      },
      commandId: proof.id,
      payment: {
        amountPaisa: Number(proof.amountPaisa),
        method: proof.method,
        paidOn: proof.paidOn,
        note: 'Verified booking upfront payment credited at check-in',
        proofFileId: proof.fileId,
        ...(proof.reference ? { transactionReference: proof.reference } : {}),
        allocations,
        depositPaisa: Number(deposit),
        advanceCreditPaisa: Number(rent + transport),
      },
    },
    c.now,
    async (_tx, scope, fileId) => {
      if (scope.stayId !== c.stayId || scope.branchId !== proof.branchId || fileId !== proof.fileId)
        throw new DomainError('NOT_FOUND', 404, 'Booking proof unavailable');
      await tx.insert(sensitiveAccessLog).values({
        actorUserId: scope.actorUserId,
        subjectUserId: terms.customerUserId,
        resource: 'private_document',
        resourceId: fileId,
        purpose: 'Verified booking upfront credit at check-in',
        createdAt: c.now,
      });
    },
  );
}
