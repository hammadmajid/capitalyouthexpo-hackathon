import { z } from 'zod';
import { stayIdentifierSchema as id } from './stay-values.js';
import { reportTypeSchema } from './insights.js';
export const reportOptionFieldSchema = z.enum(['building', 'floor', 'room', 'resident']);
// RPT-001 / SEC-003: minimal named choices share the report's authorization;
// these queries never expose the richer staff resident directory payload.
export const reportOptionQuerySchema = z
  .object({
    field: reportOptionFieldSchema,
    buildingId: id.optional(),
    floorId: id.optional(),
    search: z.string().trim().max(80).optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      (query.field === 'building' || query.field === 'resident') &&
      (query.buildingId || query.floorId)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This option field has no location parent',
      });
    if (query.field === 'floor' && (!query.buildingId || query.floorId))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose one building for floor options',
      });
  });
export const reportNamedOptionSchema = z
  .object({
    id,
    name: z.string().min(1).max(300),
    detail: z.string().min(1).max(500).nullable(),
    archived: z.boolean(),
  })
  .strict();
export const reportOptionPageSchema = z
  .object({
    branchId: id,
    type: reportTypeSchema,
    field: reportOptionFieldSchema,
    buildingId: id.nullable(),
    floorId: id.nullable(),
    data: z.array(reportNamedOptionSchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict();
export type ReportOptionQuery = z.infer<typeof reportOptionQuerySchema>;
export type ReportNamedOption = z.infer<typeof reportNamedOptionSchema>;
export type ReportOptionPage = z.infer<typeof reportOptionPageSchema>;
