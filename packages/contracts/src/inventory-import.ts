import { z } from 'zod';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const inventoryImportKindSchema = z.enum(['rooms', 'seats']);
export const inventoryImportInputSchema = z
  .object({ kind: inventoryImportKindSchema, fileId: id })
  .strict();
export const inventoryImportErrorSchema = z.enum([
  'INVALID_VALUE',
  'DUPLICATE_ROW',
  'ROOM_NUMBER_EXISTS',
  'ROOM_TYPE_UNAVAILABLE',
  'ROOM_UNAVAILABLE',
  'BED_LABEL_EXISTS',
  'CAPACITY_EXCEEDED',
  'BATCH_TOO_LARGE',
]);
export const inventoryImportRowSchema = z
  .object({
    recordNumber: z.number().int().min(2).max(501),
    roomTypeId: z.string().max(80).nullable(),
    roomNumber: z.string().max(80),
    bedLabel: z.string().max(80).nullable(),
    errors: z.array(inventoryImportErrorSchema).max(8),
  })
  .strict();
export const inventoryImportIdentitySchema = z.object({ id, branchId: id }).strict();
export const inventoryImportPageQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(500).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const inventoryImportPreviewSchema = inventoryImportIdentitySchema
  .extend({
    kind: inventoryImportKindSchema,
    status: z.enum(['validated', 'failed', 'committed']),
    totalRows: z.number().int().min(1).max(500),
    errorRows: z.number().int().min(0).max(500),
    createdAt: z.string().datetime(),
    committedAt: z.string().datetime().nullable(),
    rows: z.array(inventoryImportRowSchema).max(100),
    nextOffset: z.number().int().min(1).max(500).nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.errorRows <= value.totalRows &&
      (value.status === 'failed') === value.errorRows > 0 &&
      (value.status === 'committed') === (value.committedAt !== null),
    'Import status must match its persisted result',
  );
export const inventoryImportTemplateSchema = z
  .object({
    branchId: id,
    kind: inventoryImportKindSchema,
    fileName: z.string().max(80),
    csv: z.string().max(500),
  })
  .strict();
export type InventoryImportKind = z.infer<typeof inventoryImportKindSchema>;
export type InventoryImportRow = z.infer<typeof inventoryImportRowSchema>;
export type InventoryImportInput = z.infer<typeof inventoryImportInputSchema>;
