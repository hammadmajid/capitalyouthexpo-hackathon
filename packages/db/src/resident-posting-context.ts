import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  billingAgreementTermsSchema,
  DomainError,
  stayIdentifierSchema,
  transportBillingPolicySchema,
} from '@hsm/contracts';
import type { Database } from './index.js';
import { includedTransportRoutes } from './transport-inclusion.js';
import { stays, stayAgreements, transportSubscriptions } from './schema/index.js';
export type PostingTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export const postingScopeSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    agreementId: stayIdentifierSchema,
    actorUserId: stayIdentifierSchema,
  })
  .strict();
export type PostingScope = z.infer<typeof postingScopeSchema>;
// AUD-004: strict exclusive attribution; a worker never impersonates its authorizer.
export const financialPostingScopeSchema = z.union([
  postingScopeSchema.extend({ executionId: z.never().optional() }).strict(),
  postingScopeSchema
    .omit({ actorUserId: true })
    .extend({
      executionId: stayIdentifierSchema,
      actorUserId: z.never().optional(),
    })
    .strict(),
]);
export type FinancialPostingScope = z.infer<typeof financialPostingScopeSchema>;
export function postingConflict(): never {
  throw new DomainError('CONFLICT', 409, 'Agreed charge requires an explicit adjustment');
}
// Internal agreed-price context. Human callers authorize live scope; workers prove their live lease.
export async function readPostingContext(
  transaction: PostingTransaction,
  input: Pick<PostingScope, 'branchId' | 'stayId' | 'agreementId'>,
) {
  const [stay] = await transaction
    .select()
    .from(stays)
    .where(and(eq(stays.branchId, input.branchId), eq(stays.id, input.stayId)))
    .for('update');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (stay.id !== input.stayId || stay.branchId !== input.branchId)
    throw new DomainError('INTERNAL', 500, 'Stay scope unavailable');
  if (
    !['check_in_ready', 'active', 'notice_given', 'checkout_pending'].includes(stay.state) ||
    stay.closedAt !== null
  )
    postingConflict();
  const [agreement] = await transaction
    .select()
    .from(stayAgreements)
    .where(
      and(eq(stayAgreements.branchId, input.branchId), eq(stayAgreements.stayId, input.stayId)),
    )
    .orderBy(desc(stayAgreements.version))
    .limit(1);
  if (!agreement || agreement.id !== input.agreementId) postingConflict();
  if (agreement.branchId !== input.branchId || agreement.stayId !== input.stayId)
    throw new DomainError('INTERNAL', 500, 'Agreement scope unavailable');
  const parsed = billingAgreementTermsSchema.safeParse(agreement.termsSnapshot);
  if (!parsed.success) throw new DomainError('INTERNAL', 500, 'Agreement data unavailable');
  const terms = parsed.data;
  if (agreement.transportBillingSnapshot) {
    const transport = transportBillingPolicySchema.safeParse(agreement.transportBillingSnapshot);
    if (!transport.success) throw new DomainError('INTERNAL', 500, 'Agreement data unavailable');
    terms.policy.transportBilling = transport.data;
  }
  if (
    terms.policyVersionId !== agreement.policyVersionId ||
    BigInt(terms.rentAmountPaisa) !== agreement.rentAmountPaisa ||
    BigInt(terms.depositPaisa) !== agreement.depositPaisa
  )
    throw new DomainError('INTERNAL', 500, 'Agreement data unavailable');
  // CHG-042: transport included in agreed rent is never billed as a separate line.
  const included =
    (await includedTransportRoutes(transaction, input.branchId, input.stayId)).size > 0;
  return {
    stay,
    agreement,
    terms,
    transport: included ? [] : await transportWindows(transaction, input),
  };
}
// SERV-002 / P9-M5: approved transport windows (active or ended) for the Stay, oldest first.
async function transportWindows(
  transaction: PostingTransaction,
  input: Pick<PostingScope, 'branchId' | 'stayId'>,
) {
  const rows = await transaction
    .select({
      from: transportSubscriptions.effectiveFrom,
      to: transportSubscriptions.effectiveTo,
      charge: transportSubscriptions.monthlyChargePaisa,
    })
    .from(transportSubscriptions)
    .where(
      and(
        eq(transportSubscriptions.branchId, input.branchId),
        eq(transportSubscriptions.stayId, input.stayId),
        inArray(transportSubscriptions.status, ['active', 'ended']),
      ),
    )
    .orderBy(asc(transportSubscriptions.effectiveFrom))
    .limit(64);
  const windows = rows.flatMap((row) =>
    row.from === null ? [] : [{ from: row.from, to: row.to, chargePaisa: Number(row.charge) }],
  );
  for (const [index, window] of windows.entries()) {
    const prior = windows[index - 1];
    if (prior && (prior.to === null || prior.to > window.from))
      throw new DomainError('CONFLICT', 409, 'Transport subscription periods overlap');
  }
  return windows;
}
