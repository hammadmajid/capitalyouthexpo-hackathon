import { z } from 'zod';
import { databaseDateSchema } from './database-dates.js';
import { stayIdentifierSchema as id } from './stay-values.js';
import { residentInvoiceBalanceSchema } from './finance-reads.js';
import { complaintSchema } from './resident-feedback.js';
import { staySummarySchema } from './stay-reads.js';
export const dashboardQueueKindSchema = z.enum(['overdue', 'complaints', 'checkouts']);
export type DashboardQueueKind = z.infer<typeof dashboardQueueKindSchema>;
export const overdueQueueRowSchema = z
  .object({
    stayId: id,
    displayName: z.string().min(1).max(120),
    balance: residentInvoiceBalanceSchema.refine((value) => value.state === 'overdue'),
  })
  .strict();
const page = { branchId: id, asOf: databaseDateSchema, nextCursor: id.nullable() };
export const dashboardQueuePageSchema = z.discriminatedUnion('queue', [
  z
    .object({ ...page, queue: z.literal('overdue'), data: z.array(overdueQueueRowSchema).max(100) })
    .strict(),
  z
    .object({ ...page, queue: z.literal('complaints'), data: z.array(complaintSchema).max(100) })
    .strict(),
  z
    .object({ ...page, queue: z.literal('checkouts'), data: z.array(staySummarySchema).max(100) })
    .strict(),
]);
export type DashboardQueuePage = z.infer<typeof dashboardQueuePageSchema>;
