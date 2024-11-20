import { and, eq, gt, lt, notLike, or } from 'drizzle-orm';
import { v7 } from 'uuid';
import { DomainError, money, moneyToJson, type Money } from '@hsm/contracts';
import {
  residentCharges,
  residentInvoices,
  residentInvoiceCharges,
  residentLedger,
  residentBillingOrigins,
} from './schema/index.js';
import {
  postingConflict,
  financialPostingScopeSchema,
  type FinancialPostingScope,
  type PostingTransaction,
} from './resident-posting-context.js';
// CHG-053: a reissued bill copies its charge under a 'reissue:' key. Billing scans skip these
// copies; the original charge (credited in full by the reissue) still stands for its period.
export const REISSUE_KEY_PREFIX = 'reissue:';
export const originalChargesOnly = () =>
  notLike(residentCharges.sourceKey, REISSUE_KEY_PREFIX + '%');
export type PlannedResidentCharge = {
  kind: 'rent' | 'mess' | 'utilities' | 'admission' | 'transport';
  sourceKey: string;
  description: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  amountPaisa: Money;
};
async function existingInvoice(
  transaction: PostingTransaction,
  input: FinancialPostingScope,
  chargeId: string,
) {
  const rows = await transaction
    .select({ invoiceId: residentInvoices.id })
    .from(residentInvoiceCharges)
    .innerJoin(
      residentInvoices,
      and(
        eq(residentInvoices.id, residentInvoiceCharges.invoiceId),
        eq(residentInvoices.branchId, residentInvoiceCharges.branchId),
        eq(residentInvoices.stayId, residentInvoiceCharges.stayId),
      ),
    )
    .where(
      and(
        eq(residentInvoiceCharges.branchId, input.branchId),
        eq(residentInvoiceCharges.stayId, input.stayId),
        eq(residentInvoiceCharges.chargeId, chargeId),
      ),
    )
    .limit(2);
  const row = rows[0];
  if (rows.length !== 1 || !row)
    throw new DomainError('INTERNAL', 500, 'Existing charge posting incomplete');
  return row.invoiceId;
}
function previousCharges(
  transaction: PostingTransaction,
  input: FinancialPostingScope,
  plan: PlannedResidentCharge,
) {
  const overlap =
    plan.periodStart !== null && plan.periodEnd !== null
      ? and(
          lt(residentCharges.periodStart, plan.periodEnd),
          gt(residentCharges.periodEnd, plan.periodStart),
        )
      : undefined;
  return transaction
    .select()
    .from(residentCharges)
    .where(
      and(
        eq(residentCharges.branchId, input.branchId),
        eq(residentCharges.stayId, input.stayId),
        eq(residentCharges.kind, plan.kind),
        or(eq(residentCharges.sourceKey, plan.sourceKey), and(overlap, originalChargesOnly())),
      ),
    )
    .limit(2);
}
async function issueInvoice(
  transaction: PostingTransaction,
  input: FinancialPostingScope,
  plan: PlannedResidentCharge,
  chargeId: string,
  now: Date,
  bundle?: { id: string },
) {
  const id = bundle?.id ?? v7(),
    scope = { branchId: input.branchId, stayId: input.stayId };
  if (!bundle)
    await transaction.insert(residentInvoices).values({
      ...scope,
      id,
      number: 'INV-' + id.replaceAll('-', '').toUpperCase(),
      totalPaisa: plan.amountPaisa,
      dueDate: plan.dueDate,
      state: 'issued',
      issuedByUserId: input.actorUserId ?? null,
      issuedAt: now,
    });
  await transaction
    .insert(residentInvoiceCharges)
    .values({ ...scope, id: v7(), invoiceId: id, chargeId });
  return id;
}
async function writeCharge(
  transaction: PostingTransaction,
  input: FinancialPostingScope,
  plan: PlannedResidentCharge,
  now: Date,
  bundle?: { id: string },
) {
  const chargeId = v7(),
    scope = { branchId: input.branchId, stayId: input.stayId };
  await transaction.insert(residentCharges).values({
    ...scope,
    id: chargeId,
    agreementId: input.agreementId,
    kind: plan.kind,
    sourceKey: plan.sourceKey,
    descriptionSnapshot: plan.description,
    quantity: 1,
    amountPaisa: plan.amountPaisa,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    postedByUserId: input.actorUserId ?? null,
    postedAt: now,
  });
  await transaction.insert(residentLedger).values({
    ...scope,
    id: v7(),
    chargeId,
    account: 'receivable',
    side: 'debit',
    amountPaisa: plan.amountPaisa,
    postedAt: now,
  });
  const invoiceId = await issueInvoice(transaction, input, plan, chargeId, now, bundle);
  await recordSystemOrigin(transaction, input, chargeId, invoiceId);
  return { status: 'posted' as const, chargeId, invoiceId };
}
async function recordSystemOrigin(
  transaction: PostingTransaction,
  input: FinancialPostingScope,
  chargeId: string,
  invoiceId: string,
) {
  if (input.executionId !== undefined)
    await transaction.insert(residentBillingOrigins).values({
      branchId: input.branchId,
      stayId: input.stayId,
      agreementId: input.agreementId,
      executionId: input.executionId,
      chargeId,
      invoiceId,
    });
}
// Private shared persistence primitive: plans come only from scoped agreed-price wrappers.
// This is not a generic client charge API. Caller owns transaction, audit and outbox.
export async function postPlannedResidentCharge(
  transaction: PostingTransaction,
  value: FinancialPostingScope,
  plan: PlannedResidentCharge,
  now: Date,
) {
  const input = financialPostingScopeSchema.parse(value);
  const previous = await previousCharges(transaction, input, plan),
    charge = previous[0];
  if (previous.length > 1) postingConflict();
  if (charge) {
    if (
      charge.branchId !== input.branchId ||
      charge.stayId !== input.stayId ||
      charge.agreementId !== input.agreementId ||
      charge.kind !== plan.kind ||
      charge.sourceKey !== plan.sourceKey ||
      charge.periodStart !== plan.periodStart ||
      charge.periodEnd !== plan.periodEnd ||
      charge.amountPaisa !== plan.amountPaisa
    )
      postingConflict();
    return {
      status: 'already_posted' as const,
      chargeId: charge.id,
      invoiceId: await existingInvoice(transaction, input, charge.id),
    };
  }
  if (plan.amountPaisa === 0n)
    return { status: 'no_charge' as const, chargeId: null, invoiceId: null };
  moneyToJson(plan.amountPaisa);
  return writeCharge(transaction, input, plan, now);
}

// One transaction creates one unpublished invoice for a new rent/transport pair.
// Previously issued documents are never amended or erased by this helper.
export async function postPlannedResidentChargeBatch(
  tx: PostingTransaction,
  scope: FinancialPostingScope,
  plans: PlannedResidentCharge[],
  now: Date,
  primaryIndex = 0,
) {
  const input = financialPostingScopeSchema.parse(scope);
  const prior = await Promise.all(plans.map((plan) => previousCharges(tx, input, plan)));
  if ((prior[primaryIndex]?.length ?? 0) > 0) {
    const results = [];
    for (const [index, plan] of plans.entries())
      results.push(
        index === primaryIndex
          ? await postPlannedResidentCharge(tx, input, plan, now)
          : { status: 'no_charge' as const, chargeId: null, invoiceId: null },
      );
    return results;
  }
  if (prior.some((rows) => rows.length > 0)) {
    const results = [];
    for (const plan of plans) results.push(await postPlannedResidentCharge(tx, input, plan, now));
    return results;
  }
  const first = plans[0];
  if (!first || plans.some((plan) => plan.amountPaisa <= 0n || plan.dueDate !== first.dueDate))
    postingConflict();
  const total = plans.reduce((sum, plan) => sum + plan.amountPaisa, 0n);
  moneyToJson(money(total));
  const bundle = { id: v7() };
  await tx.insert(residentInvoices).values({
    id: bundle.id,
    branchId: input.branchId,
    stayId: input.stayId,
    number: 'INV-' + bundle.id.replaceAll('-', '').toUpperCase(),
    totalPaisa: total,
    dueDate: first.dueDate,
    state: 'issued',
    issuedByUserId: input.actorUserId ?? null,
    issuedAt: now,
  });
  const results = [];
  for (const plan of plans) results.push(await writeCharge(tx, input, plan, now, bundle));
  return results;
}
