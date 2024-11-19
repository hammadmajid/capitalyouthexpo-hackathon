import { z } from 'zod';
import { residentInvoiceBalanceSchema } from './finance-reads.js';
import { stayIdentifierSchema as id } from './stay-values.js';
// RB-004: one billing month (Asia/Karachi calendar); the server defaults to the current month.
export const rentBoardMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((value) => Number(value.slice(0, 4)) >= 2000, 'Invalid month');
export const rentBoardQuerySchema = z
  .object({
    month: rentBoardMonthSchema.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(25).default(20),
  })
  .strict();
export type RentBoardQuery = z.infer<typeof rentBoardQuerySchema>;
// RB-001/002 / Q5: management-only states from real invoice records. Before due date and
// grace expiry an unpaid invoice is neutral (issued); a pending proof needs action (Q5).
export const rentBoardStateSchema = z.enum([
  'proof_pending',
  'overdue',
  'partially_paid',
  'issued',
  'paid',
  'no_charge',
  'voided',
  'not_billed',
]);
export type RentBoardState = z.infer<typeof rentBoardStateSchema>;
const precedence: RentBoardState[] = [
  'overdue',
  'partially_paid',
  'issued',
  'paid',
  'no_charge',
  'voided',
];
// Q5 (resolved 2026-10-20): a pending proof is "action needed" and takes priority; the
// invoice facts (e.g. partially paid) stay visible per invoice. Otherwise the most urgent
// invoice state wins, and no invoice in the month is "not billed".
export function rentBoardState(
  states: readonly RentBoardState[],
  pendingProofs = 0,
): RentBoardState {
  if (pendingProofs > 0) return 'proof_pending';
  return precedence.find((state) => states.includes(state)) ?? 'not_billed';
}
export const rentBoardRowSchema = z
  .object({
    stayId: id,
    residentId: id,
    displayName: z.string(),
    stayState: z.string(),
    roomLabel: z.string().nullable(),
    bedLabel: z.string().nullable(),
    state: rentBoardStateSchema,
    // PAY-004: resident proofs awaiting review for this row's invoices in the month.
    pendingProofs: z.number().int().nonnegative(),
    invoices: z.array(residentInvoiceBalanceSchema).max(31),
  })
  .strict()
  .refine(
    (row) =>
      row.state ===
      rentBoardState(
        row.invoices.map((invoice) => invoice.state),
        row.pendingProofs,
      ),
    'Rent Board state must follow its invoices',
  );
export const rentBoardPageSchema = z
  .object({
    branchId: id,
    month: rentBoardMonthSchema,
    data: z.array(rentBoardRowSchema).max(25),
    nextCursor: id.nullable(),
  })
  .strict();
export type RentBoardPage = z.infer<typeof rentBoardPageSchema>;
