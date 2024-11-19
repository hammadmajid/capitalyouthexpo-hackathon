import { z } from 'zod';
export const filePurposeSchema = z.enum([
  'listing_photo',
  'payment_proof',
  'resident_document',
  'agreement_template',
  'stay_agreement',
  'verification_document',
  'chat_attachment',
  'complaint_attachment',
  'receipt_pdf',
  'export',
  'avatar',
  'import',
  'staff_agreement',
]);
export const uploadPurposeSchema = filePurposeSchema.exclude(['receipt_pdf', 'export']);
export const fileMimeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
export const fileStatusSchema = z.enum(['pending', 'clean', 'rejected']);
const documentMimes = ['image/jpeg', 'image/png', 'application/pdf'] as const;
const imageMimes = ['image/jpeg', 'image/png', 'image/webp'] as const;
const purposeMimes: Record<
  z.infer<typeof uploadPurposeSchema>,
  readonly z.infer<typeof fileMimeSchema>[]
> = {
  listing_photo: imageMimes,
  avatar: imageMimes,
  payment_proof: documentMimes,
  resident_document: documentMimes,
  agreement_template: documentMimes,
  stay_agreement: documentMimes,
  verification_document: documentMimes,
  chat_attachment: documentMimes,
  complaint_attachment: documentMimes,
  staff_agreement: documentMimes,
  import: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};
export const storedUploadSchema = z
  .object({
    purpose: uploadPurposeSchema,
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine(
        (name) =>
          !/[\\/:]/.test(name) &&
          Array.from(name).every((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127),
        'Invalid file name',
      )
      .refine(
        (name) =>
          !/\.(exe|com|bat|cmd|ps1|sh|js|mjs|vbs|dll|scr|msi|jar|apk|docm|xlsm|pptm)(\.|$)/i.test(
            name,
          ),
        'Executable files are forbidden',
      ),
    mimeType: fileMimeSchema,
    sizeBytes: z.number().int().positive().max(10000000),
  })
  .strict()
  .superRefine((value, context) => {
    const imageOnly = value.purpose === 'listing_photo' || value.purpose === 'avatar';
    const limit = value.purpose === 'import' ? 5000000 : imageOnly ? 8000000 : 10000000;
    if (value.sizeBytes > limit)
      context.addIssue({
        code: 'custom',
        path: ['sizeBytes'],
        message: 'File too large for purpose',
      });
    if (!purposeMimes[value.purpose].includes(value.mimeType))
      context.addIssue({
        code: 'custom',
        path: ['mimeType'],
        message: 'MIME type does not match purpose',
      });
    const suffixes: Record<z.infer<typeof fileMimeSchema>, readonly string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
      'application/pdf': ['pdf'],
      'text/csv': ['csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
    };
    const extension = value.fileName.split('.').at(-1)?.toLowerCase();
    if (
      !extension ||
      value.fileName.lastIndexOf('.') < 1 ||
      !suffixes[value.mimeType].includes(extension)
    )
      context.addIssue({
        code: 'custom',
        path: ['fileName'],
        message: 'File extension does not match MIME type',
      });
  });
export const avatarMaxBytes = 5000000;
// New photo uploads (any purpose) are capped at 5 MB; the app compresses photos first.
// Stored files keep the older 8 MB listing-photo rule so existing photos stay valid.
export const photoMaxBytes = 5000000;
const photoUploadMimes: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const uploadSchema = storedUploadSchema
  .refine((value) => value.purpose !== 'avatar' || value.sizeBytes <= avatarMaxBytes, {
    path: ['sizeBytes'],
    message: 'Profile photos must be 5 MB or smaller',
  })
  .refine(
    (value) => !photoUploadMimes.includes(value.mimeType) || value.sizeBytes <= photoMaxBytes,
    { path: ['sizeBytes'], message: 'Photos must be 5 MB or smaller' },
  );
export type Upload = z.infer<typeof uploadSchema>;
export const fileStatusResponseSchema = z
  .object({
    fileId: z.string().uuid(),
    scanStatus: fileStatusSchema,
    mimeType: fileMimeSchema,
    sizeBytes: z.number().int().positive().max(10000000),
  })
  .strict();
export const uploadResponseSchema = z
  .object({
    fileId: z.string().uuid(),
    uploadUrl: z.string().url(),
    headers: z.record(z.string()),
    expiresAt: z.string().datetime(),
  })
  .strict();
export const downloadResponseSchema = z
  .object({
    url: z.string().url(),
    expiresAt: z.string().datetime(),
  })
  .strict();
