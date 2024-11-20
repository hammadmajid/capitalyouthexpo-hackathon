import { and, asc, eq, inArray, isNotNull, lt, notExists, sql } from 'drizzle-orm';
import { z } from 'zod';
import { databaseDateSchema, stayIdentifierSchema } from '@hsm/contracts';
import {
  notificationOutbox,
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  stayAgreements,
  stays,
} from './schema/index.js';
import type { Database } from './index.js';
import type { PostingTransaction } from './resident-posting-context.js';
export const RESIDENT_RENT_EVENT = 'resident.rent' as const;
export const residentRentPayloadSchema = z
  .object({
    event: z.enum(['rent.due', 'rent.overdue']),
    stayId: stayIdentifierSchema,
    invoiceId: stayIdentifierSchema,
  })
  .strict();
export type ResidentRentPayload = z.infer<typeof residentRentPayloadSchema>;
const OPEN_STAY_STATES = ['active', 'notice_given', 'checkout_pending'] as const;
export const RENT_OVERDUE_BATCH = 100;
function dedupeKey(payload: ResidentRentPayload) {
  const kind = payload.event === 'rent.due' ? 'due' : 'overdue';
  return `resident.rent:${kind}:${payload.invoiceId}`;
}
// NTF-001/003: recipient-free domain event; fanout re-validates the invoice balance and
// notifies only the Stay's own linked account. The unique dedupe key makes it once-only.
export async function enqueueResidentRent(
  tx: PostingTransaction | Database,
  value: unknown,
  clock: Date,
) {
  const payload = residentRentPayloadSchema.parse(value),
    now = z.date().parse(clock);
  await tx
    .insert(notificationOutbox)
    .values({
      eventType: RESIDENT_RENT_EVENT,
      channel: 'in_app',
      recipientUserId: null,
      payload,
      dedupeKey: dedupeKey(payload),
      createdAt: now,
      nextAttemptAt: now,
    })
    .onConflictDoNothing({ target: notificationOutbox.dedupeKey });
}
function karachiToday(now: Date) {
  return databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
}
// RB-002 / NTF-001: issued invoices of linked open Stays whose agreed grace has expired.
// Grace comes from the invoice's own agreement snapshot; the fanout still re-checks the
// authoritative balance, so a paid or voided invoice is suppressed rather than announced.
export async function sweepRentOverdue(db: Database, now: Date) {
  const today = karachiToday(now);
  const candidates = await db
    .select({ invoiceId: residentInvoices.id, stayId: residentInvoices.stayId })
    .from(residentInvoices)
    .innerJoin(
      stays,
      and(eq(stays.id, residentInvoices.stayId), eq(stays.branchId, residentInvoices.branchId)),
    )
    .where(
      and(
        eq(residentInvoices.state, 'issued'),
        lt(residentInvoices.dueDate, today),
        isNotNull(stays.userId),
        inArray(stays.state, [...OPEN_STAY_STATES]),
        sql`exists (
          select 1 from ${residentInvoiceCharges}
          join ${residentCharges} on ${residentCharges.id} = ${residentInvoiceCharges.chargeId}
            and ${residentCharges.stayId} = ${residentInvoiceCharges.stayId}
          join ${stayAgreements} on ${stayAgreements.id} = ${residentCharges.agreementId}
            and ${stayAgreements.stayId} = ${residentInvoiceCharges.stayId}
          where ${residentInvoiceCharges.invoiceId} = ${residentInvoices.id}
            and ${residentInvoices.dueDate} + ((${stayAgreements.termsSnapshot}->'policy'->>'graceDays')::int) < ${today}::date
        )`,
        notExists(
          db
            .select({ id: notificationOutbox.id })
            .from(notificationOutbox)
            .where(
              eq(
                notificationOutbox.dedupeKey,
                sql`'resident.rent:overdue:' || ${residentInvoices.id}::text`,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(residentInvoices.dueDate), asc(residentInvoices.id))
    .limit(RENT_OVERDUE_BATCH);
  for (const candidate of candidates)
    await enqueueResidentRent(db, { event: 'rent.overdue', ...candidate }, now);
  return candidates.length;
}
