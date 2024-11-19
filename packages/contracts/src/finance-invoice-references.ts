import { z } from 'zod';
import { instantSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';
import { inventoryPageQuerySchema, inventoryPageSequenceIsValid } from './inventory-pages.js';
// FIN-001 / PAY-008: references support selection of actual private records.
// Document state is not a financial Paid/Unpaid claim; read the exact balance.
export const stayInvoiceKindSchema = z.enum([
  'rent',
  'mess',
  'utilities',
  'admission',
  'custom',
  'late_fee',
  'transport',
  'mixed',
]);
export type StayInvoiceKind = z.infer<typeof stayInvoiceKindSchema>;
export const stayInvoiceReferenceQuerySchema = inventoryPageQuerySchema;
export const staffStayInvoiceReferenceQuerySchema = inventoryPageQuerySchema
  .extend({
    category: z.literal('transport').optional(),
  })
  .strict();
export type StaffStayInvoiceReferenceQuery = z.infer<typeof staffStayInvoiceReferenceQuerySchema>;
export const stayInvoiceReferenceSchema = z
  .object({
    invoiceId: stayIdentifierSchema,
    invoiceNumber: stayPrivateText(64),
    dueDate: databaseDateSchema,
    issuedAt: instantSchema,
    documentState: z.enum(['issued', 'voided']),
    // CHG-050: what the bill is for, from its charges; "mixed" when it combines kinds.
    kind: stayInvoiceKindSchema.optional(),
  })
  .strict();
export const stayInvoiceReferencePageSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    data: z.array(stayInvoiceReferenceSchema).max(100),
    nextCursor: stayIdentifierSchema.nullable(),
  })
  .strict()
  .refine((page) => {
    const rows = page.data.map((row) => ({ id: row.invoiceId }));
    return (
      inventoryPageSequenceIsValid(rows) &&
      (page.nextCursor === null || rows.at(-1)?.id === page.nextCursor)
    );
  }, 'Invoice references require ordered unique records and exact continuation');
export type StayInvoiceReferencePage = z.infer<typeof stayInvoiceReferencePageSchema>;
export type StayInvoiceReferenceQuery = z.infer<typeof stayInvoiceReferenceQuerySchema>;
// Validate the requested boundary as well as the page's internal consistency.
export function invoiceReferencePageMatches(
  page: StayInvoiceReferencePage,
  stayId: string,
  query: StayInvoiceReferenceQuery,
  branchId?: string,
) {
  return (
    page.stayId === stayId &&
    (branchId === undefined || page.branchId === branchId) &&
    page.data.length <= query.limit &&
    inventoryPageSequenceIsValid(
      page.data.map((row) => ({ id: row.invoiceId })),
      query.cursor,
    ) &&
    (page.nextCursor === null || page.data.length === query.limit)
  );
}
