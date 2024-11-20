import { and, eq } from 'drizzle-orm';
import { DomainError, bookingQuoteSnapshotSchema } from '@hsm/contracts';
import { hostelAuditLog, transportRoutes, transportSubscriptions } from './schema/index.js';
import { readPostingContext, type PostingTransaction } from './resident-posting-context.js';
import { planAgreedCharge } from './resident-billing-plan.js';
import { postCombinedResidentCharge } from './resident-combined-billing.js';
import { authorizeResidentBilling } from './resident-billing-authorize.js';
import type { ManualAdmissionContext } from './resident-manual-admission.js';

// SERV-002 / BKG-004: booking opt-in becomes one subscription at actual check-in.
export async function activateBookingTransport(tx: PostingTransaction, c: ManualAdmissionContext) {
  if (!c.booking) return;
  const quote = bookingQuoteSnapshotSchema.parse(c.booking.snapshot);
  if (!quote.transportRequested || !quote.transportOffer) return;
  const offer = quote.transportOffer;
  const [route] = await tx
    .select({ id: transportRoutes.id })
    .from(transportRoutes)
    .where(
      and(
        eq(transportRoutes.id, offer.routeId),
        eq(transportRoutes.branchId, c.input.scope.branchId),
        eq(transportRoutes.status, 'active'),
      ),
    )
    .for('share');
  if (!route) throw new DomainError('CONFLICT', 409, 'Booked transport route is unavailable');
  const [subscription] = await tx
    .insert(transportSubscriptions)
    .values({
      branchId: c.input.scope.branchId,
      stayId: c.stayId,
      routeId: route.id,
      status: 'active',
      monthlyChargePaisa: BigInt(offer.monthlyChargePaisa),
      effectiveFrom: c.admittedOn,
      decidedByUserId: c.input.scope.actorUserId,
      version: 1,
      createdAt: c.now,
      updatedAt: c.now,
    })
    .returning({ id: transportSubscriptions.id });
  if (!subscription) throw new DomainError('INTERNAL', 500, 'Transport subscription unavailable');
  const scope = { branchId: c.input.scope.branchId, stayId: c.stayId, agreementId: c.agreementId };
  const context = await readPostingContext(tx, scope);
  let periodIndex = 0;
  for (; periodIndex < 1200; periodIndex += 1) {
    const plan = planAgreedCharge(context, { item: 'transport', cadence: 'periodic', periodIndex });
    if (!plan || (plan.periodEnd && plan.periodEnd > c.admittedOn)) break;
  }
  const plan = planAgreedCharge(context, { item: 'transport', cadence: 'periodic', periodIndex });
  if (!plan || plan.amountPaisa === null)
    throw new DomainError('CONFLICT', 409, 'Booked transport needs a calculable billing policy');
  await postCombinedResidentCharge(
    tx,
    { ...scope, actorUserId: c.input.scope.actorUserId },
    { ...plan, amountPaisa: plan.amountPaisa },
    c.now,
    context,
  );
  await authorizeResidentBilling(
    tx,
    {
      ...c.input.scope,
      ...scope,
      item: 'transport',
      cadence: 'periodic',
      periodIndex: periodIndex + 1,
      dispatch: 'on_due_date',
    },
    c.now,
  );
  await tx.insert(hostelAuditLog).values({
    ...c.input.scope,
    action: 'transport.booking.activated',
    targetType: 'transport_subscription',
    targetId: subscription.id,
    after: {
      bookingId: c.booking.id,
      stayId: c.stayId,
      monthlyChargePaisa: offer.monthlyChargePaisa,
    },
    createdAt: c.now,
  });
}
