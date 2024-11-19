import { z } from 'zod';
import { inventoryArchiveInputSchema } from './inventory.js';
import { listingVersionSchema } from './listing-settings.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const order = z.number().int().min(0).max(2147483647);
const position = z.object({ id, sortOrder: order }).strict();
export const listingRuleCursorSchema = z
  .string()
  .min(38)
  .max(47)
  .regex(/^(0|[1-9][0-9]{0,9}):[0-9a-fA-F-]{36}$/)
  .refine((value) => {
    const separator = value.indexOf(':');
    return position.safeParse({
      sortOrder: Number(value.slice(0, separator)),
      id: value.slice(separator + 1),
    }).success;
  }, 'Invalid listing rule continuation')
  .transform((value) => value.toLowerCase());
export function decodeListingRuleCursor(input: string) {
  const value = listingRuleCursorSchema.parse(input),
    separator = value.indexOf(':');
  return { sortOrder: Number(value.slice(0, separator)), id: value.slice(separator + 1) };
}
export function encodeListingRuleCursor(sortOrder: number, ruleId: string) {
  return listingRuleCursorSchema.parse(String(sortOrder) + ':' + ruleId);
}
export const listingRuleInputSchema = z
  .object({ body: z.string().trim().min(1).max(4000), sortOrder: order })
  .strict();
export const listingRuleArchiveSchema = inventoryArchiveInputSchema;
export const publicListingRuleSchema = position
  .extend({ body: listingRuleInputSchema.shape.body })
  .strict();
export const privateListingRuleSchema = publicListingRuleSchema
  .extend({
    branchId: id,
    version: listingVersionSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    archivedAt: z.string().datetime().nullable(),
  })
  .strict();
export const privateListingRuleStateSchema = privateListingRuleSchema
  .extend({ canEdit: z.boolean() })
  .strict();
export const publicListingRulesQuerySchema = z
  .object({
    cursor: listingRuleCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const listingRulesQuerySchema = publicListingRulesQuerySchema
  .extend({
    state: z.enum(['active', 'archived']).default('active'),
  })
  .strict();
type RulePosition = { id: string; sortOrder: number };
function positionAfter(row: RulePosition, before: RulePosition) {
  return (
    before.sortOrder < row.sortOrder || (before.sortOrder === row.sortOrder && before.id < row.id)
  );
}
export function listingRuleSequenceIsValid(rows: RulePosition[], after?: RulePosition) {
  return (
    new Set(rows.map((row) => row.id)).size === rows.length &&
    rows.every((row, index) => {
      const before = rows[index - 1] ?? after;
      return !before || positionAfter(row, before);
    })
  );
}
function validPage(page: { data: RulePosition[]; nextCursor: string | null }) {
  const last = page.data.at(-1);
  return (
    listingRuleSequenceIsValid(page.data) &&
    (page.nextCursor === null ||
      (last !== undefined && page.nextCursor === String(last.sortOrder) + ':' + last.id))
  );
}
export const publicListingRulesPageSchema = z
  .object({
    branchId: id,
    data: z.array(publicListingRuleSchema).max(100),
    nextCursor: listingRuleCursorSchema.nullable(),
  })
  .strict()
  .refine(validPage, 'Listing rules require unique ordered rows and an exact continuation');
export const privateListingRulesPageSchema = z
  .object({
    branchId: id,
    state: z.enum(['active', 'archived']),
    canEdit: z.boolean(),
    data: z.array(privateListingRuleSchema).max(100),
    nextCursor: listingRuleCursorSchema.nullable(),
  })
  .strict()
  .refine(validPage, 'Listing rules require unique ordered rows and an exact continuation')
  .refine(
    (page) => page.data.every((row) => row.branchId === page.branchId),
    'Listing rule scope mismatch',
  )
  .refine(
    (page) =>
      page.data.every((row) =>
        page.state === 'active' ? row.archivedAt === null : row.archivedAt !== null,
      ),
    'Listing rule history state mismatch',
  );
export type ListingRuleInput = z.infer<typeof listingRuleInputSchema>;
export type ListingRulesQuery = z.infer<typeof listingRulesQuerySchema>;
export type PublicListingRulesQuery = z.infer<typeof publicListingRulesQuerySchema>;
export type PrivateListingRule = z.infer<typeof privateListingRuleSchema>;
