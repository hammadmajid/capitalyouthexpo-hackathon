import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { validateContent } from './content.js';
const bytes = Buffer.from('%PDF-1.7\nfixture content\n');
const input = {
  purpose: 'payment_proof' as const,
  fileName: 'proof.pdf',
  mimeType: 'application/pdf' as const,
  sizeBytes: bytes.length,
};
it('SEC: actual content and server hash must match declared metadata', async () => {
  expect(await validateContent(input, bytes)).toEqual(createHash('sha256').update(bytes).digest());
  await expect(validateContent({ ...input, sizeBytes: bytes.length + 1 }, bytes)).rejects.toThrow(
    'SIZE_MISMATCH',
  );
  await expect(
    validateContent({ ...input, fileName: 'proof.png', mimeType: 'image/png' }, bytes),
  ).rejects.toThrow('CONTENT_MISMATCH');
});
it('SEC: unknown and truncated binary content fails closed', async () => {
  for (const content of [Buffer.from('unknown binary data fixture'), Buffer.from('PK\x03\x04')]) {
    await expect(validateContent({ ...input, sizeBytes: content.length }, content)).rejects.toThrow(
      'CONTENT_MISMATCH',
    );
  }
});
it('SEC: CSV requires nonempty plain UTF8 and rejects scripts/control bytes', async () => {
  const csv = Buffer.from('name,city\nAlice,Islamabad\n');
  const metadata = {
    purpose: 'import' as const,
    fileName: 'data.csv',
    mimeType: 'text/csv' as const,
    sizeBytes: csv.length,
  };
  expect(await validateContent(metadata, csv)).toEqual(createHash('sha256').update(csv).digest());
  for (const content of [
    Buffer.from('#!/bin/sh\nfixture'),
    Buffer.from('name\0city'),
    Buffer.from([255, 255, 255]),
    bytes,
    Buffer.from('   '),
  ]) {
    await expect(
      validateContent({ ...metadata, sizeBytes: content.length }, content),
    ).rejects.toThrow('CONTENT_MISMATCH');
  }
});
