import { stayLastPayment } from './stay-last-payment.js';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  databaseDateSchema,
  DomainError,
  settlementNet,
  staySettlementSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { stays } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { readResidentFundBalance } from './resident-fund-balance.js';
import { stayFundSources, stayInvoiceBalances } from './stay-financial-pages.js';
const inputSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    today: databaseDateSchema,
  })
  .strict();
const INVOICE_LIMIT = 200,
  SOURCE_LIMIT = 100;
// OUT-005: settlement derived only from committed invoices, payments and fund movements.
// Caller holds live authority for the exact Stay (staff finance_view or the linked account).
export async function readStaySettlement(tx: PostingTransaction, value: unknown) {
  const input = inputSchema.parse(value);
  const [stay] = await tx
    .select({ id: stays.id, branchId: stays.branchId, state: stays.state })
    .from(stays)
    .where(and(eq(stays.branchId, input.branchId), eq(stays.id, input.stayId)))
    .for('share');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const invoices = [];
  let nextInvoiceDueDate: string | null = null;
  let outstanding = 0n,
    invoiceCount = 0;
  for await (const invoice of stayInvoiceBalances(tx, input)) {
    outstanding += BigInt(invoice.outstandingPaisa);
    invoiceCount += 1;
    if (
      invoice.outstandingPaisa > 0 &&
      invoice.dueDate >= input.today &&
      (nextInvoiceDueDate === null || invoice.dueDate < nextInvoiceDueDate)
    )
      nextInvoiceDueDate = invoice.dueDate;
    if (invoices.length < INVOICE_LIMIT) invoices.push(invoice);
  }
  const funds = await readResidentFundBalance(tx, {
    branchId: input.branchId,
    stayId: input.stayId,
  });
  const fundSources = [];
  for await (const source of stayFundSources(tx, {
    branchId: input.branchId,
    stayId: input.stayId,
  })) {
    fundSources.push(source);
    if (fundSources.length === SOURCE_LIMIT) break;
  }
  const result = staySettlementSchema.safeParse({
    stayId: stay.id,
    branchId: stay.branchId,
    stayState: stay.state,
    invoices,
    invoicesTruncated: invoiceCount > INVOICE_LIMIT,
    nextInvoiceDueDate,
    lastApprovedPayment: await stayLastPayment(tx, input),
    outstandingPaisa: Number(outstanding),
    deposit: funds.deposit,
    advance: {
      receivedPaisa: funds.advance.receivedPaisa,
      appliedToRentPaisa: funds.advance.appliedToRentPaisa,
      deductedPaisa: 0,
      refundedPaisa: funds.advance.refundedPaisa,
      heldPaisa: funds.advance.availablePaisa,
    },
    ...settlementNet(Number(outstanding), funds.deposit.heldPaisa, funds.advance.availablePaisa),
    fundSources,
    asOf: input.today,
  });
  if (!result.success) throw new DomainError('INTERNAL', 500, 'Settlement unavailable');
  return result.data;
}
