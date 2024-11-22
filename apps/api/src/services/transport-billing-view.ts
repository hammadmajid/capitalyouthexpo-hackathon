import { and, desc, eq, gt, inArray, isNull, lt, ne, notExists, or } from 'drizzle-orm';
import { transportInvoiceState } from '@hsm/contracts';
import { alias } from 'drizzle-orm/pg-core';
import {
  readResidentInvoiceBalances,
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  transportSubscriptions,
} from '@hsm/db';
import type { Transaction } from '../audit/writer.js';

export async function transportBillingBySubscription(
  tx: Transaction,
  branchId: string,
  ids: string[],
  today: string,
) {
  const result = new Map<
    string,
    {
      invoiceId: string;
      dueDate: string;
      outstandingPaisa: number;
      state: 'due' | 'overdue' | 'paid' | 'cleared';
    }
  >();
  if (!ids.length) return result;
  const otherLine = alias(residentInvoiceCharges, 'other_line');
  const otherCharge = alias(residentCharges, 'other_charge');
  const mixed = tx
    .select({ id: otherLine.id })
    .from(otherLine)
    .innerJoin(otherCharge, eq(otherCharge.id, otherLine.chargeId))
    .where(and(eq(otherLine.invoiceId, residentInvoices.id), ne(otherCharge.kind, 'transport')));
  const rows = await tx
    .selectDistinctOn([transportSubscriptions.id], {
      subscriptionId: transportSubscriptions.id,
      invoiceId: residentInvoices.id,
      stayId: residentInvoices.stayId,
    })
    .from(transportSubscriptions)
    .innerJoin(
      residentCharges,
      and(
        eq(residentCharges.branchId, transportSubscriptions.branchId),
        eq(residentCharges.stayId, transportSubscriptions.stayId),
        eq(residentCharges.kind, 'transport'),
      ),
    )
    .innerJoin(residentInvoiceCharges, eq(residentInvoiceCharges.chargeId, residentCharges.id))
    .innerJoin(residentInvoices, eq(residentInvoices.id, residentInvoiceCharges.invoiceId))
    .where(
      and(
        eq(transportSubscriptions.branchId, branchId),
        inArray(transportSubscriptions.id, ids),
        eq(residentInvoices.state, 'issued'),
        gt(residentCharges.periodEnd, transportSubscriptions.effectiveFrom),
        or(
          isNull(transportSubscriptions.effectiveTo),
          lt(residentCharges.periodStart, transportSubscriptions.effectiveTo),
        ),
        notExists(mixed),
      ),
    )
    .orderBy(transportSubscriptions.id, desc(residentInvoices.dueDate), desc(residentInvoices.id));
  if (!rows.length) return result;
  const invoices = [
    ...new Map(rows.map(({ invoiceId, stayId }) => [invoiceId, { invoiceId, stayId }])).values(),
  ];
  const balances = await readResidentInvoiceBalances(tx, { branchId, today, invoices });
  const byId = new Map(balances.map((row) => [row.invoiceId, row]));
  for (const row of rows) {
    const balance = byId.get(row.invoiceId);
    if (!balance) continue;
    const { invoiceId, dueDate, outstandingPaisa } = balance;
    result.set(row.subscriptionId, {
      invoiceId,
      dueDate,
      outstandingPaisa,
      state: transportInvoiceState(balance, today),
    });
  }
  return result;
}
