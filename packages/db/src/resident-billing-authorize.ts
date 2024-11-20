import { billingRunAt } from './resident-charge-plan.js';
import { z } from 'zod';
import { v7 } from 'uuid';
import { stayIdentifierSchema } from '@hsm/contracts';
import { hostelAuditLog, notificationOutbox, residentBillingSchedules } from './schema/index.js';
import {
  postingScopeSchema,
  readPostingContext,
  type PostingTransaction,
} from './resident-posting-context.js';
import { planScheduledResidentCharge } from './resident-billing-plan.js';
import { residentBillingJobKey, RESIDENT_BILLING_EVENT } from './resident-billing-job.js';
const inputSchema = postingScopeSchema
  .extend({
    organizationId: stayIdentifierSchema,
    actorRole: z.enum(['owner', 'manager']),
    dispatch: z.enum(['immediate', 'on_due_date']),
    item: z.enum(['rent', 'mess', 'utilities', 'admission', 'transport']),
    cadence: z.enum(['periodic', 'one_time']),
    periodIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
// RENT-004 / AUD-004: internal transaction component. The caller must hold live human
// authorization and parent locks. The explicit cursor never infers historical arrears.
export async function authorizeResidentBilling(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
) {
  const input = inputSchema.parse(value),
    now = z.date().parse(clock);
  const context = await readPostingContext(tx, input);
  const plan = planScheduledResidentCharge(context, {
    item: input.item,
    cadence: input.cadence,
    periodIndex: input.periodIndex,
  });
  const state =
    plan === null ? 'exhausted' : plan.amountPaisa === null ? 'manual_required' : 'active';
  const id = v7(),
    currentJobId = state === 'active' ? v7() : null;
  const nextRunAt =
    plan && state === 'active' ? (input.dispatch === 'immediate' ? now : billingRunAt(plan)) : null;
  const authorizationAuditId = await recordAuthorization(tx, input, id, now);
  await initialJob(tx, input, id, currentJobId, now, nextRunAt ?? now);
  await tx.insert(residentBillingSchedules).values({
    id,
    branchId: input.branchId,
    stayId: input.stayId,
    agreementId: input.agreementId,
    item: input.item,
    cadence: input.cadence,
    state,
    authorizedByUserId: input.actorUserId,
    authorizationAuditId,
    version: 1,
    periodIndex: BigInt(input.periodIndex),
    currentJobId,
    nextRunAt,
    createdAt: now,
    updatedAt: now,
  });
  return { id, state, version: 1, periodIndex: input.periodIndex, currentJobId };
}

async function recordAuthorization(
  tx: PostingTransaction,
  input: z.infer<typeof inputSchema>,
  id: string,
  now: Date,
) {
  const [audit] = await tx
    .insert(hostelAuditLog)
    .values({
      organizationId: input.organizationId,
      branchId: input.branchId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'billing.schedule.authorized',
      targetType: 'resident_billing_schedule',
      targetId: id,
      after: {
        agreementId: input.agreementId,
        item: input.item,
        cadence: input.cadence,
        periodIndex: input.periodIndex,
      },
      createdAt: now,
    })
    .returning({ id: hostelAuditLog.id });
  if (!audit) throw new Error('Billing authorization audit unavailable');
  return audit.id;
}

async function initialJob(
  tx: PostingTransaction,
  input: z.infer<typeof inputSchema>,
  id: string,
  currentJobId: string | null,
  now: Date,
  nextRunAt: Date,
) {
  if (currentJobId) {
    const payload = { scheduleId: id, version: 1, periodIndex: input.periodIndex };
    await tx.insert(notificationOutbox).values({
      id: currentJobId,
      eventType: RESIDENT_BILLING_EVENT,
      channel: 'internal',
      payload,
      dedupeKey: residentBillingJobKey(payload),
      nextAttemptAt: nextRunAt,
      createdAt: now,
    });
  }
}
