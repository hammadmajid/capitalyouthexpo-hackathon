import { and, asc, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import {
  residentInvoices,
  residentPaymentProofInvoices,
  residentPaymentProofs,
  residentReceipts,
  residents,
  rooms,
  seats,
  stayAssignments,
  stays,
} from '@hsm/db';
import { DomainError, residentProofSchema, type ResidentProof } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type Covered = { invoiceId: string; invoiceNumber: string };
type ProofRow = {
  proof: typeof residentPaymentProofs.$inferSelect;
  invoiceNumber: string | null;
  receiptId: string | null;
  // CHG-050: the other bills this proof also pays.
  covered?: Covered[] | undefined;
};
export function projectProof({
  proof,
  invoiceNumber,
  receiptId,
  covered,
}: ProofRow): ResidentProof {
  const result = residentProofSchema.safeParse({
    id: proof.id,
    branchId: proof.branchId,
    stayId: proof.stayId,
    invoiceId: proof.invoiceId,
    invoiceNumber,
    invoices: [
      ...(proof.invoiceId && invoiceNumber ? [{ invoiceId: proof.invoiceId, invoiceNumber }] : []),
      ...(covered ?? []),
    ],
    amountPaisa: Number(proof.amountPaisa),
    depositPaisa: Number(proof.depositPaisa ?? 0n),
    method: proof.method,
    paidOn: proof.paidOn,
    reference: proof.reference,
    state: proof.state,
    reviewReason: proof.state === 'rejected' ? proof.reviewReason : null,
    paymentId: proof.paymentId,
    receiptId,
    submittedAt: proof.createdAt.toISOString(),
    reviewedAt: proof.reviewedAt?.toISOString() ?? null,
  });
  if (!result.success) throw new DomainError('INTERNAL', 500, 'Payment proof unavailable');
  return result.data;
}
// Proof rows with invoice number and (after approval) the immutable receipt identity.
export function proofSelect(tx: Transaction) {
  return tx
    .select({
      proof: residentPaymentProofs,
      invoiceNumber: residentInvoices.number,
      receiptId: residentReceipts.id,
      residentName: residents.displayName,
      roomLabel: rooms.label,
      bedLabel: seats.label,
    })
    .from(residentPaymentProofs)
    .leftJoin(
      residentInvoices,
      and(
        eq(residentInvoices.id, residentPaymentProofs.invoiceId),
        eq(residentInvoices.stayId, residentPaymentProofs.stayId),
        eq(residentInvoices.branchId, residentPaymentProofs.branchId),
      ),
    )
    .innerJoin(
      stays,
      and(
        eq(stays.id, residentPaymentProofs.stayId),
        eq(stays.branchId, residentPaymentProofs.branchId),
      ),
    )
    .innerJoin(
      residents,
      and(eq(residents.id, stays.residentId), eq(residents.branchId, stays.branchId)),
    )
    .leftJoin(
      residentReceipts,
      and(
        eq(residentReceipts.paymentId, residentPaymentProofs.paymentId),
        eq(residentReceipts.stayId, residentPaymentProofs.stayId),
      ),
    )
    .leftJoin(
      stayAssignments,
      and(
        eq(stayAssignments.stayId, stays.id),
        eq(stayAssignments.branchId, stays.branchId),
        // The open assignment, or none after checkout.
        isNull(stayAssignments.endedAt),
      ),
    )
    .leftJoin(rooms, eq(rooms.id, stayAssignments.roomId))
    .leftJoin(seats, eq(seats.id, stayAssignments.seatId));
}
export function proofPageFilter(cursor: string | undefined) {
  return cursor === undefined ? undefined : lt(residentPaymentProofs.id, cursor);
}
export const proofOrder = desc(residentPaymentProofs.id);
// CHG-050: attach each proof's extra bills (one query for the whole page).
export async function withCovered<Row extends { proof: { id: string } }>(
  tx: Transaction,
  rows: Row[],
): Promise<(Row & { covered: Covered[] })[]> {
  const ids = rows.map((row) => row.proof.id);
  const extra = ids.length
    ? await tx
        .select({
          proofId: residentPaymentProofInvoices.proofId,
          invoiceId: residentPaymentProofInvoices.invoiceId,
          invoiceNumber: residentInvoices.number,
          dueDate: residentInvoices.dueDate,
        })
        .from(residentPaymentProofInvoices)
        .innerJoin(
          residentInvoices,
          and(
            eq(residentInvoices.id, residentPaymentProofInvoices.invoiceId),
            eq(residentInvoices.stayId, residentPaymentProofInvoices.stayId),
            eq(residentInvoices.branchId, residentPaymentProofInvoices.branchId),
          ),
        )
        .where(inArray(residentPaymentProofInvoices.proofId, ids))
        .orderBy(asc(residentInvoices.dueDate), asc(residentInvoices.id))
    : [];
  return rows.map((row) => ({
    ...row,
    covered: extra
      .filter((item) => item.proofId === row.proof.id)
      .map(({ invoiceId, invoiceNumber }) => ({ invoiceId, invoiceNumber })),
  }));
}
