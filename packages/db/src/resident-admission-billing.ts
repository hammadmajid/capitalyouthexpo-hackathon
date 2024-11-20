import { z } from 'zod';
import {
  DomainError,
  admissionBillingSelectionSchema,
  hasCompleteAdmissionSelection,
  stayIdentifierSchema,
} from '@hsm/contracts';
import {
  postingScopeSchema,
  readPostingContext,
  type PostingTransaction,
} from './resident-posting-context.js';
import { postAgreedRentPeriod } from './resident-rent.js';
import { postAgreedFeePeriod } from './resident-fees.js';
import { authorizeResidentBilling } from './resident-billing-authorize.js';
import { enqueueResidentRent } from './rent-notices.js';
export const selectionSchema = admissionBillingSelectionSchema;
const commandSchema = z
  .object({
    scope: postingScopeSchema
      .extend({ organizationId: stayIdentifierSchema, actorRole: z.enum(['owner', 'manager']) })
      .strict(),
    selections: z.array(selectionSchema).min(1).max(33),
  })
  .strict();
type Selection = z.infer<typeof selectionSchema>;
export function requireCompleteSelection(
  terms: Awaited<ReturnType<typeof readPostingContext>>['terms'],
  selections: Selection[],
) {
  if (!hasCompleteAdmissionSelection(terms, selections))
    throw new DomainError(
      'VALIDATION_FAILED',
      400,
      'Select exactly rent and every disclosed fee starting period',
    );
}
async function postInitial(
  tx: PostingTransaction,
  scope: z.infer<typeof commandSchema>['scope'],
  value: Selection,
  now: Date,
) {
  const human = {
    branchId: scope.branchId,
    stayId: scope.stayId,
    agreementId: scope.agreementId,
    actorUserId: scope.actorUserId,
    periodIndex: value.periodIndex,
    ...(value.manualAmountPaisa === undefined
      ? {}
      : { manualAmountPaisa: value.manualAmountPaisa }),
  };
  if (value.item === 'rent') return postAgreedRentPeriod(tx, human, now);
  return postAgreedFeePeriod(
    tx,
    {
      ...human,
      fee: { code: value.item, cadence: value.cadence === 'periodic' ? 'monthly' : 'one_time' },
    },
    now,
  );
}
// STAY-001 / RENT-003/004 / AUD-004: complete initial obligations and future schedules
// inside the caller's atomic admission. No separate transaction, default cursor or fake payment.
export async function initializeAdmissionBilling(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
) {
  const input = commandSchema.parse(value),
    now = z.date().parse(clock);
  const context = await readPostingContext(tx, input.scope);
  requireCompleteSelection(context.terms, input.selections);
  const results = [];
  for (const selection of input.selections) {
    const posting = await postInitial(tx, input.scope, selection, now);
    if (posting.status === 'posted' && posting.invoiceId !== null)
      await enqueueResidentRent(
        tx,
        { event: 'rent.due', stayId: input.scope.stayId, invoiceId: posting.invoiceId },
        now,
      );
    const periodIndex = selection.periodIndex + (posting.status === 'no_period' ? 0 : 1);
    const schedule = await authorizeResidentBilling(
      tx,
      {
        ...input.scope,
        item: selection.item,
        cadence: selection.cadence,
        periodIndex,
        dispatch: 'on_due_date',
      },
      now,
    );
    results.push({ item: selection.item, cadence: selection.cadence, posting, schedule });
  }
  return results;
}
