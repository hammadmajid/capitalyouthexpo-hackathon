import { and, asc, eq, exists, gt, inArray, ne, notExists, or } from 'drizzle-orm';
import { z } from 'zod';
import { residentCharges, residentInvoiceCharges, residentInvoices } from '@hsm/db';
import {
  DomainError,
  stayInvoiceReferenceSchema,
  stayInvoiceReferencePageSchema,
  invoiceReferencePageMatches,
  inventoryPageSequenceIsValid,
  type StayInvoiceKind,
  type StayInvoiceReferenceQuery,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
const storedRows = z
  .array(
    stayInvoiceReferenceSchema
      .omit({ issuedAt: true, kind: true })
      .extend({ issuedAt: z.date() })
      .strict(),
  )
  .max(101);
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Invoice references unavailable');
}
function invoiceCategory(tx: Transaction, category: 'transport' | 'other') {
  const line = tx
    .select({ id: residentInvoiceCharges.id })
    .from(residentInvoiceCharges)
    .innerJoin(residentCharges, eq(residentCharges.id, residentInvoiceCharges.chargeId));
  const transport = line.where(
    and(
      eq(residentInvoiceCharges.invoiceId, residentInvoices.id),
      eq(residentCharges.kind, 'transport'),
    ),
  );
  const other = tx
    .select({ id: residentInvoiceCharges.id })
    .from(residentInvoiceCharges)
    .innerJoin(residentCharges, eq(residentCharges.id, residentInvoiceCharges.chargeId))
    .where(
      and(
        eq(residentInvoiceCharges.invoiceId, residentInvoices.id),
        ne(residentCharges.kind, 'transport'),
      ),
    );
  return category === 'transport' ? exists(transport) : or(notExists(transport), exists(other));
}
// FIN-001 / SEC-003: called only after lockFinancialReadStay in the same transaction.
// Use the existing branch/Stay/id index; no receipt joins, N+1 balances or paid inference.
export async function readInvoiceReferencePage(
  tx: Transaction,
  branchId: string,
  stayId: string,
  query: StayInvoiceReferenceQuery,
  category?: 'transport' | 'other',
) {
  const raw = await tx
    .select({
      invoiceId: residentInvoices.id,
      invoiceNumber: residentInvoices.number,
      dueDate: residentInvoices.dueDate,
      issuedAt: residentInvoices.issuedAt,
      documentState: residentInvoices.state,
    })
    .from(residentInvoices)
    .where(
      and(
        eq(residentInvoices.branchId, branchId),
        eq(residentInvoices.stayId, stayId),
        category ? invoiceCategory(tx, category) : undefined,
        query.cursor ? gt(residentInvoices.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(residentInvoices.id))
    .limit(query.limit + 1);
  const parsed = storedRows.safeParse(raw);
  if (!parsed.success || parsed.data.length > query.limit + 1) unavailable();
  const rows = parsed.data;
  if (
    !inventoryPageSequenceIsValid(
      rows.map((row) => ({ id: row.invoiceId })),
      query.cursor,
    )
  )
    unavailable();
  const kinds = await invoiceKinds(
    tx,
    branchId,
    rows.slice(0, query.limit).map((row) => row.invoiceId),
  );
  const data = rows.slice(0, query.limit).map((row) => ({
    ...row,
    issuedAt: row.issuedAt.toISOString(),
    ...(kinds.has(row.invoiceId) ? { kind: kinds.get(row.invoiceId) } : {}),
  }));
  const page = stayInvoiceReferencePageSchema.safeParse({
    branchId,
    stayId,
    data,
    nextCursor: rows.length > query.limit ? data.at(-1)?.invoiceId : null,
  });
  if (!page.success || !invoiceReferencePageMatches(page.data, stayId, query, branchId))
    unavailable();
  return page.data;
}
// CHG-050: each bill's kind from its charge lines (one query for the page).
async function invoiceKinds(tx: Transaction, branchId: string, invoiceIds: string[]) {
  const result = new Map<string, StayInvoiceKind>();
  if (!invoiceIds.length) return result;
  const lines = await tx
    .select({ invoiceId: residentInvoiceCharges.invoiceId, kind: residentCharges.kind })
    .from(residentInvoiceCharges)
    .innerJoin(residentCharges, eq(residentCharges.id, residentInvoiceCharges.chargeId))
    .where(
      and(
        eq(residentInvoiceCharges.branchId, branchId),
        inArray(residentInvoiceCharges.invoiceId, invoiceIds),
      ),
    );
  for (const line of lines) {
    const before = result.get(line.invoiceId);
    result.set(line.invoiceId, before && before !== line.kind ? 'mixed' : line.kind);
  }
  return result;
}
