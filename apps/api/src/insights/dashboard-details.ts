import { and, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  chatMessages,
  conversations,
  conversationReads,
  residentCharges,
  residentInvoiceCharges,
  stays,
  transportSubscriptions,
} from '@hsm/db';
import { money, moneyToJson, ownerDashboardDetailsSchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { dashboardSalaryDue } from './dashboard-salary.js';
import { metricInvoiceBalancePages } from './metric-invoices.js';

type Details = ReturnType<typeof ownerDashboardDetailsSchema.parse>;
const json = (value: bigint) => moneyToJson(money(value));
export function emptyDashboardDetails(month: string): Details {
  const end = new Date(month + '-01T00:00:00Z');
  return {
    rentCollectedPaisa: 0,
    transportCollectedPaisa: 0,
    otherCollectedPaisa: 0,
    overduePaisa: 0,
    salaryDuePaisa: 0,
    transportRequests: 0,
    unreadMessages: 0,
    trend: Array.from({ length: 6 }, (_, i) => {
      const date = new Date(end);
      date.setUTCMonth(date.getUTCMonth() - 5 + i);
      return { month: date.toISOString().slice(0, 7), collectedPaisa: 0 };
    }),
  };
}
// Mixed-invoice allocations have no per-line earmark. Attribute analytics proportionally
// to immutable charge faces, using integer paisa and keeping rounding in Other/Rent.
export function collectedCategories(paid: number, rent: bigint, transport: bigint, other: bigint) {
  const total = rent + transport + other;
  if (!total) return { rent: 0, transport: 0, other: paid };
  const transportPaid = (BigInt(paid) * transport) / total;
  const otherPaid = (BigInt(paid) * other) / total;
  const remainder = BigInt(paid) - transportPaid - otherPaid;
  return {
    rent: rent > 0n ? json(remainder) : 0,
    transport: json(transportPaid),
    other: json(otherPaid + (rent > 0n ? 0n : remainder)),
  };
}
export async function dashboardDetails(
  tx: Transaction,
  branchId: string,
  actorId: string,
  month: string,
  today: string,
): Promise<Details> {
  const result = emptyDashboardDetails(month);
  for await (const page of metricInvoiceBalancePages(tx, branchId, today, undefined)) {
    const lines = await tx
      .select({
        invoiceId: residentInvoiceCharges.invoiceId,
        kind: residentCharges.kind,
        amount: residentCharges.amountPaisa,
      })
      .from(residentInvoiceCharges)
      .innerJoin(residentCharges, eq(residentCharges.id, residentInvoiceCharges.chargeId))
      .where(
        and(
          eq(residentInvoiceCharges.branchId, branchId),
          inArray(
            residentInvoiceCharges.invoiceId,
            page.map((row) => row.invoiceId),
          ),
        ),
      );
    for (const balance of page) {
      if (balance.state === 'overdue')
        result.overduePaisa = json(BigInt(result.overduePaisa) + BigInt(balance.outstandingPaisa));
      const point = result.trend.find((row) => row.month === balance.dueDate.slice(0, 7));
      if (point)
        point.collectedPaisa = json(BigInt(point.collectedPaisa) + BigInt(balance.allocatedPaisa));
      if (balance.dueDate.slice(0, 7) !== month) continue;
      const weights = { rent: 0n, transport: 0n, other: 0n };
      for (const line of lines.filter((row) => row.invoiceId === balance.invoiceId))
        weights[
          line.kind === 'rent' ? 'rent' : line.kind === 'transport' ? 'transport' : 'other'
        ] += line.amount;
      const split = collectedCategories(
        balance.allocatedPaisa,
        weights.rent,
        weights.transport,
        weights.other,
      );
      result.rentCollectedPaisa = json(BigInt(result.rentCollectedPaisa) + BigInt(split.rent));
      result.transportCollectedPaisa = json(
        BigInt(result.transportCollectedPaisa) + BigInt(split.transport),
      );
      result.otherCollectedPaisa = json(BigInt(result.otherCollectedPaisa) + BigInt(split.other));
    }
  }
  await dashboardQueues(tx, branchId, actorId, today, result);
  return ownerDashboardDetailsSchema.parse(result);
}
async function dashboardQueues(
  tx: Transaction,
  branchId: string,
  actorId: string,
  today: string,
  result: Details,
) {
  const [requests] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(transportSubscriptions)
    .innerJoin(stays, eq(stays.id, transportSubscriptions.stayId))
    .where(
      and(
        eq(transportSubscriptions.branchId, branchId),
        eq(transportSubscriptions.status, 'requested'),
        inArray(stays.state, ['active', 'notice_given', 'checkout_pending']),
      ),
    );
  result.transportRequests = requests?.count ?? 0;
  const [messages] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .innerJoin(conversations, eq(conversations.id, chatMessages.conversationId))
    .leftJoin(
      conversationReads,
      and(
        eq(conversationReads.conversationId, conversations.id),
        eq(conversationReads.userId, actorId),
      ),
    )
    .where(
      and(
        eq(conversations.branchId, branchId),
        ne(chatMessages.senderUserId, actorId),
        isNull(chatMessages.deletedAt),
        or(
          isNull(conversationReads.lastReadAt),
          gt(chatMessages.createdAt, conversationReads.lastReadAt),
        ),
      ),
    );
  result.unreadMessages = messages?.count ?? 0;
  result.salaryDuePaisa = json(await dashboardSalaryDue(tx, branchId, today));
}
export function sumDashboardDetails(rows: Details[], month: string): Details {
  const result = emptyDashboardDetails(month);
  for (const row of rows) {
    for (const key of [
      'rentCollectedPaisa',
      'transportCollectedPaisa',
      'otherCollectedPaisa',
      'overduePaisa',
      'salaryDuePaisa',
    ] as const)
      result[key] = json(BigInt(result[key]) + BigInt(row[key]));
    result.transportRequests += row.transportRequests;
    result.unreadMessages += row.unreadMessages;
    for (const point of result.trend)
      point.collectedPaisa = json(
        BigInt(point.collectedPaisa) +
          BigInt(row.trend.find((item) => item.month === point.month)?.collectedPaisa ?? 0),
      );
  }
  return ownerDashboardDetailsSchema.parse(result);
}
