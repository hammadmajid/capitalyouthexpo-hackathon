import { z } from 'zod';
import { instantSchema } from './dates.js';
const id = z.string().uuid();
export const adminExplorerKindSchema = z.enum([
  'users',
  'owners',
  'managers',
  'hostels',
  'branches',
  'bookings',
  'complaints',
  'occupancy',
  'payments',
]);
export type AdminExplorerKind = z.infer<typeof adminExplorerKindSchema>;
export const adminExplorerQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    status: z
      .string()
      .trim()
      .max(40)
      .regex(/^[a-z_]*$/)
      .default(''),
    period: z.enum(['month', 'quarter', 'year', 'lifetime']).default('lifetime'),
    sort: z.enum(['newest', 'oldest', 'name_asc', 'name_desc']).default('newest'),
    parentId: id.optional(),
    ownerId: id.optional(),
    managerId: id.optional(),
    cursor: z.string().max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type AdminExplorerQuery = z.infer<typeof adminExplorerQuerySchema>;
export const adminExplorerRecordSchema = z
  .object({
    id,
    name: z.string(),
    status: z.string(),
    createdAt: instantSchema,
    parentId: id.nullable(),
    parentName: z.string().nullable(),
    quantity: z.number().int().nonnegative().nullable(),
    amountPaisa: z.string().regex(/^\d+$/).nullable(),
    reason: z.string().nullable(),
  })
  .strict();
export type AdminExplorerRecord = z.infer<typeof adminExplorerRecordSchema>;
const count = z.number().int().nonnegative();
export const adminExplorerPageSchema = z
  .object({
    kind: adminExplorerKindSchema,
    generatedAt: instantSchema,
    timezone: z.literal('Asia/Karachi'),
    data: z.array(adminExplorerRecordSchema).max(50),
    nextCursor: z.string().nullable(),
    totalCount: count,
    statistics: z.object({ month: count, quarter: count, year: count, lifetime: count }).strict(),
    statisticsLabel: z.string(),
    statuses: z.array(z.string()).max(30),
    quantity: count.nullable(),
    amountPaisa: z.string().regex(/^\d+$/).nullable(),
    notice: z.string(),
  })
  .strict();
export const adminExplorerLinkSchema = z
  .object({
    label: z.string(),
    kind: adminExplorerKindSchema,
    id: id.optional(),
    parentId: id.optional(),
    ownerId: id.optional(),
    managerId: id.optional(),
  })
  .strict();
export const adminExplorerDetailSchema = z
  .object({
    kind: adminExplorerKindSchema,
    record: adminExplorerRecordSchema,
    facts: z.array(z.object({ label: z.string(), value: z.string() }).strict()).max(30),
    links: z.array(adminExplorerLinkSchema).max(15),
    action: z.enum(['verification', 'customer_governance', 'none']),
    notice: z.string(),
  })
  .strict();
export const adminExplorerSummarySchema = z
  .object({
    generatedAt: instantSchema,
    counts: z
      .object({
        users: count,
        owners: count,
        managers: count,
        hostels: count,
        branches: count,
        bookings: count,
        complaints: count,
        occupancy: count,
        payments: count,
        approvals: count,
      })
      .strict(),
  })
  .strict();
