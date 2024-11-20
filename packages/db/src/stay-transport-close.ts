import { and, eq, inArray } from 'drizzle-orm';
import { hostelAuditLog, transportSubscriptions } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
type Scope = {
  organizationId: string;
  branchId: string;
  stayId: string;
  actorUserId: string;
  actorRole: 'owner' | 'manager';
};
const nextDay = (date: string) =>
  new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
// SERV-002 / CHG-042: checkout closes the Stay's transport too. A pending request is
// withdrawn; an active subscription ends on the checkout date (billing already stops with the
// Stay, so no period is re-invoiced). Issued invoices and earlier records stay untouched.
export async function closeTransportAtCheckout(
  tx: PostingTransaction,
  scope: Scope,
  today: string,
  now: Date,
) {
  const rows = await tx
    .select()
    .from(transportSubscriptions)
    .where(
      and(
        eq(transportSubscriptions.branchId, scope.branchId),
        eq(transportSubscriptions.stayId, scope.stayId),
        inArray(transportSubscriptions.status, ['requested', 'active']),
      ),
    )
    .for('update');
  for (const row of rows) {
    const change =
      row.status === 'requested'
        ? { status: 'withdrawn' as const }
        : {
            status: 'ended' as const,
            // The end must follow the start; a start after checkout covers no billed day.
            effectiveTo:
              row.effectiveFrom && today <= row.effectiveFrom ? nextDay(row.effectiveFrom) : today,
          };
    await tx
      .update(transportSubscriptions)
      .set({ ...change, reason: 'Checked out', version: row.version + 1, updatedAt: now })
      .where(eq(transportSubscriptions.id, row.id));
    await tx.insert(hostelAuditLog).values({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      actorUserId: scope.actorUserId,
      actorRole: scope.actorRole,
      action: 'transport.subscription.closed_at_checkout',
      targetType: 'transport_subscription',
      targetId: row.id,
      before: { status: row.status, version: row.version },
      after: { ...change, version: row.version + 1 },
      createdAt: now,
    });
  }
  return rows.length;
}
