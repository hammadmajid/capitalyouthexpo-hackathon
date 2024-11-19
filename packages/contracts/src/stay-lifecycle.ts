import { z } from 'zod';
import { instantSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { moneyJsonSchema } from './money.js';
import { residentInvoiceBalanceSchema } from './finance-reads.js';
import { stayIdentifierSchema as id, stayPrivateText, stayStateSchema } from './stay-values.js';
// RES-005: transfer result; inputs come from stay-commands (approved baseline).
export const stayTransferResultSchema = z
  .object({
    stayId: id,
    fromAssignmentId: id,
    toAssignmentId: id,
    roomId: id,
    bedId: id.nullable(),
    transferredAt: instantSchema,
    agreement: z
      .object({
        agreementId: id,
        previousAgreementId: id,
        previousRentPaisa: moneyJsonSchema,
        rentAmountPaisa: moneyJsonSchema,
        effectiveFrom: databaseDateSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
// OUT-003/004: deposit deductions, refunds and credit applications are recorded hostel acts
// against the exact source payment. HSM never moves money.
const amount = moneyJsonSchema.gt(0);
export const fundMovementInputSchema = z
  .object({
    paymentId: id,
    movement: z.union([
      z
        .object({
          kind: z.enum(['deposit_apply', 'advance_apply']),
          amountPaisa: amount,
          reason: stayPrivateText(500),
          invoiceId: id,
        })
        .strict(),
      z
        .object({
          kind: z.enum(['deposit_deduct', 'deposit_refund', 'advance_refund']),
          amountPaisa: amount,
          reason: stayPrivateText(500),
          externalReference: stayPrivateText(160).optional(),
        })
        .strict(),
    ]),
  })
  .strict();
export type FundMovementInput = z.infer<typeof fundMovementInputSchema>;
export const fundMovementResultSchema = z
  .object({
    movementId: id,
    paymentId: id,
    kind: z.enum([
      'deposit_apply',
      'advance_apply',
      'deposit_deduct',
      'deposit_refund',
      'advance_refund',
    ]),
    amountPaisa: amount,
  })
  .strict();
const balance = z
  .object({
    receivedPaisa: moneyJsonSchema,
    appliedToRentPaisa: moneyJsonSchema,
    deductedPaisa: moneyJsonSchema,
    refundedPaisa: moneyJsonSchema,
    heldPaisa: moneyJsonSchema,
  })
  .strict();
// OUT-005: the settlement statement, derived only from committed ledger records.
export const staySettlementSchema = z
  .object({
    stayId: id,
    branchId: id,
    stayState: stayStateSchema,
    invoices: z.array(residentInvoiceBalanceSchema).max(200),
    invoicesTruncated: z.boolean(),
    outstandingPaisa: moneyJsonSchema,
    nextInvoiceDueDate: databaseDateSchema.nullable().optional(),
    lastApprovedPayment: z
      .object({
        paymentId: id,
        receiptId: id,
        receiptNumber: z.string().min(1).max(64),
        amountPaisa: moneyJsonSchema,
        receivedOn: databaseDateSchema,
      })
      .strict()
      .nullable()
      .optional(),
    deposit: balance,
    advance: balance,
    // Money the resident still owes after held funds, or the hostel still owes back.
    netPayablePaisa: moneyJsonSchema,
    netRefundablePaisa: moneyJsonSchema,
    // Payments whose deposit or advance can still fund a movement (source of each act).
    fundSources: z
      .array(
        z
          .object({
            paymentId: id,
            receiptNumber: z.string(),
            depositPaisa: moneyJsonSchema,
            advanceCreditPaisa: moneyJsonSchema,
          })
          .strict(),
      )
      .max(100),
    asOf: databaseDateSchema,
  })
  .strict()
  .refine(
    (value) => value.netPayablePaisa === 0 || value.netRefundablePaisa === 0,
    'A statement is either payable or refundable',
  );
export type StaySettlement = z.infer<typeof staySettlementSchema>;
export const stayExtensionResultSchema = z
  .object({
    stayId: id,
    version: z.number().int().positive(),
    expectedLeaveDate: databaseDateSchema,
    billing: z
      .array(
        z
          .object({
            scheduleId: id,
            item: z.enum(['rent', 'mess', 'utilities', 'admission']),
            result: z.enum(['topped_up', 'manual_top_up_required', 'resumed', 'manual_required']),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();
export const stayCheckoutResultSchema = z
  .object({
    stayId: id,
    state: z.literal('completed'),
    closedAt: instantSchema,
    statementId: id,
    statement: staySettlementSchema,
    depositApplied: z
      .array(z.object({ paymentId: id, invoiceId: id, amountPaisa: amount }).strict())
      .max(400),
  })
  .strict();
// P9-FIX-04 / OUT-005: the frozen statement never changes; money recorded after checkout is
// listed beside it and the live balance is recomputed from committed records. A refund the
// hostel still owes is netRefundablePaisa in `current`; only a recorded movement is "refunded".
export const postCheckoutMovementSchema = z
  .object({
    kind: z.enum([
      'deposit_apply',
      'advance_apply',
      'deposit_deduct',
      'deposit_refund',
      'advance_refund',
      'payment',
    ]),
    amountPaisa: amount,
    recordedAt: instantSchema,
    externalReference: z.string().max(160).nullable(),
  })
  .strict();
export const stayFinalStatementResponseSchema = z
  .object({
    statementId: id,
    createdAt: instantSchema,
    statement: staySettlementSchema,
    afterCheckout: z
      .object({
        movements: z.array(postCheckoutMovementSchema).max(100),
        current: staySettlementSchema,
      })
      .strict(),
  })
  .strict();
export type StayFinalStatementResponse = z.infer<typeof stayFinalStatementResponseSchema>;
export type StayCheckoutResult = z.infer<typeof stayCheckoutResultSchema>;
// OUT-005: settlement arithmetic over authoritative totals; integer paisa only.
export function settlementNet(outstanding: number, depositHeld: number, advanceHeld: number) {
  const net = BigInt(depositHeld) + BigInt(advanceHeld) - BigInt(outstanding);
  return net >= 0n
    ? { netPayablePaisa: 0, netRefundablePaisa: Number(net) }
    : { netPayablePaisa: Number(-net), netRefundablePaisa: 0 };
}
