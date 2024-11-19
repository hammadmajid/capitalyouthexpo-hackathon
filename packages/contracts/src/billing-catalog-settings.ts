import { z } from 'zod';
import { billingCatalogSnapshotSchema } from './billing-catalog.js';
import { instantSchema } from './dates.js';
import { inventoryPageQuerySchema, inventoryPageSequenceIsValid } from './inventory-pages.js';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';
// FIN-004 / CHG-014: immutable configured unit prices, not a charge/posting request.
export const billingCatalogInputSchema = billingCatalogSnapshotSchema.omit({ catalogId: true });
export const billingCatalogArchiveSchema = z.object({ reason: stayPrivateText(500) }).strict();
export const billingCatalogEntrySchema = billingCatalogInputSchema
  .extend({
    id: stayIdentifierSchema,
    branchId: stayIdentifierSchema,
    createdAt: instantSchema,
    archivedAt: instantSchema.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.archivedAt === null || Date.parse(value.archivedAt) >= Date.parse(value.createdAt),
    'Archive cannot precede creation',
  );
export const billingCatalogQuerySchema = inventoryPageQuerySchema
  .extend({
    includeArchived: z.enum(['true', 'false']).optional(),
  })
  .strict();
export const billingCatalogPageSchema = z
  .object({
    branchId: stayIdentifierSchema,
    canEdit: z.boolean(),
    includeArchived: z.boolean(),
    data: z.array(billingCatalogEntrySchema).max(100),
    nextCursor: stayIdentifierSchema.nullable(),
  })
  .strict()
  .refine(
    (page) =>
      inventoryPageSequenceIsValid(page.data) &&
      (page.nextCursor === null || page.data.at(-1)?.id === page.nextCursor),
    'Exact ordered continuation required',
  )
  .refine(
    (page) =>
      page.data.every(
        (row) =>
          row.branchId === page.branchId && (page.includeArchived || row.archivedAt === null),
      ),
    'Catalogue branch or archive mismatch',
  );
export type BillingCatalogInput = z.infer<typeof billingCatalogInputSchema>;
export type BillingCatalogEntry = z.infer<typeof billingCatalogEntrySchema>;
export type BillingCatalogQuery = z.infer<typeof billingCatalogQuerySchema>;
export type BillingCatalogPage = z.infer<typeof billingCatalogPageSchema>;
