import { expect, it } from 'vitest';
import {
  agreementTemplateSchema,
  agreementFileInputSchema,
  agreementFileQuerySchema,
} from './agreement-documents.js';
import { uploadSchema } from './files.js';
const id = '10000000-0000-4000-8000-000000000001';
it('STAY-002: requires real text or a document and rejects spoofed evidence', () => {
  expect(
    agreementTemplateSchema.safeParse({ title: 'Terms', text: '', fileId: null }).success,
  ).toBe(false);
  expect(
    agreementTemplateSchema.parse({ title: 'Terms', text: 'Resident conduct', fileId: null }).text,
  ).toBe('Resident conduct');
  expect(
    agreementFileInputSchema.safeParse({ fileId: id, label: 'Signed scan', uploadedBy: id })
      .success,
  ).toBe(false);
  expect(agreementFileQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
});
it.each(['agreement_template', 'stay_agreement'])(
  'SEC-003: %s reuses private document upload constraints',
  (purpose) => {
    expect(
      uploadSchema.safeParse({
        purpose,
        fileName: 'agreement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 50,
      }).success,
    ).toBe(true);
    expect(
      uploadSchema.safeParse({
        purpose,
        fileName: 'agreement.csv',
        mimeType: 'text/csv',
        sizeBytes: 50,
      }).success,
    ).toBe(false);
  },
);
