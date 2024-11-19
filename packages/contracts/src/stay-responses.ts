import { z } from 'zod';
import { stayIdentifierSchema, stayVersionSchema, stayStateSchema } from './stay-values.js';
export const stayCommandResultSchema = z
  .object({
    id: stayIdentifierSchema,
    branchId: stayIdentifierSchema,
    version: stayVersionSchema,
    state: stayStateSchema,
  })
  .strict();
export const stayPreparationResultSchema = stayCommandResultSchema
  .extend({
    state: z.literal('check_in_ready'),
    residentId: stayIdentifierSchema,
    agreementId: stayIdentifierSchema,
  })
  .strict();
export const stayAdmissionResultSchema = stayCommandResultSchema
  .extend({
    state: z.literal('active'),
    residentId: stayIdentifierSchema,
    assignmentId: stayIdentifierSchema,
    agreementId: stayIdentifierSchema,
    invoiceIds: z.array(stayIdentifierSchema).max(33),
  })
  .strict()
  .refine(
    (value) => new Set(value.invoiceIds).size === value.invoiceIds.length,
    'Duplicate initial invoice',
  );
export type StayCommandResult = z.infer<typeof stayCommandResultSchema>;
export type StayPreparationResult = z.infer<typeof stayPreparationResultSchema>;
export type StayAdmissionResult = z.infer<typeof stayAdmissionResultSchema>;
