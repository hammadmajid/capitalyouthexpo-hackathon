import { z } from 'zod';
import { stayIdentifierSchema as id } from './stay-values.js';
export const agreementTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    text: z.string().trim().max(12000),
    fileId: id.nullable(),
  })
  .strict()
  .refine(
    (value) => value.text.length > 0 || value.fileId !== null,
    'Enter agreement terms or attach a document',
  );
export const agreementTemplateInputSchema = z
  .object({
    policyVersionId: id,
    template: agreementTemplateSchema.nullable(),
  })
  .strict();
export const agreementFileInputSchema = z
  .object({
    fileId: id,
    label: z.string().trim().min(1).max(120),
  })
  .strict();
export const agreementFileSchema = z
  .object({
    id,
    branchId: id,
    stayId: id,
    agreementId: id,
    fileId: id,
    label: z.string().min(1).max(120),
    uploadedBy: id,
    createdAt: z.string().datetime(),
  })
  .strict();
export const agreementFileQuerySchema = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const agreementFilePageSchema = z
  .object({
    branchId: id,
    stayId: id,
    agreementId: id,
    data: z.array(agreementFileSchema).max(50),
    nextCursor: id.nullable(),
  })
  .strict();
export type AgreementTemplateInput = z.infer<typeof agreementTemplateInputSchema>;
export type AgreementFileInput = z.infer<typeof agreementFileInputSchema>;
export type AgreementFileQuery = z.infer<typeof agreementFileQuerySchema>;
