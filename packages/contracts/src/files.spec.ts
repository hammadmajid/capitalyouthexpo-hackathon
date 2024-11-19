import { expect, it } from 'vitest';
import {
  uploadSchema,
  fileStatusResponseSchema,
  uploadResponseSchema,
  downloadResponseSchema,
} from './files.js';
const base = {
  purpose: 'payment_proof',
  fileName: 'proof.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 100,
};
it.each([
  'payment_proof',
  'resident_document',
  'verification_document',
  'chat_attachment',
  'complaint_attachment',
])('SEC: private document upload purpose %s is accepted', (purpose) => {
  expect(uploadSchema.parse({ ...base, purpose }).purpose).toBe(purpose);
});
it.each([
  { purpose: 'avatar', fileName: 'avatar.png', mimeType: 'image/png', sizeBytes: 5000000 },
  { purpose: 'listing_photo', fileName: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 5000000 },
  { purpose: 'import', fileName: 'data.csv', mimeType: 'text/csv', sizeBytes: 5000000 },
  {
    purpose: 'import',
    fileName: 'data.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 5000000,
  },
])('SEC: permitted image and import metadata is accepted', (input) => {
  expect(uploadSchema.safeParse(input).success).toBe(true);
});
it.each([
  { purpose: 'receipt_pdf' },
  { purpose: 'export' },
  { purpose: 'avatar' },
  { purpose: 'import' },
  { fileName: '../proof.pdf' },
  { fileName: 'a.exe.pdf' },
  { fileName: 'a.js.pdf' },
  { fileName: 'a\\proof.pdf' },
  { fileName: 'a:proof.pdf' },
  { fileName: 'a' + String.fromCharCode(0) + '.pdf' },
  { fileName: 'proof.png' },
  { fileName: '.pdf' },
  { sizeBytes: 0 },
  { sizeBytes: 10000001 },
  { sizeBytes: 1.5 },
  { unexpected: true },
  { purpose: 'avatar', fileName: 'a.png', mimeType: 'image/png', sizeBytes: 5000001 },
  { purpose: 'listing_photo', fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 5000001 },
  { fileName: 'proof.jpg', mimeType: 'image/jpeg', sizeBytes: 5000001 },
])('SEC: invalid or executable upload metadata is rejected', (change) => {
  expect(uploadSchema.safeParse({ ...base, ...change }).success).toBe(false);
});
it('SEC: file DTOs reject storage keys and undeclared data', () => {
  const fileId = '11111111-1111-4111-8111-111111111111';
  expect(
    fileStatusResponseSchema.safeParse({
      fileId,
      scanStatus: 'clean',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    }).success,
  ).toBe(true);
  expect(
    fileStatusResponseSchema.safeParse({
      fileId,
      scanStatus: 'clean',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      storageKey: 'private/key',
    }).success,
  ).toBe(false);
  expect(
    uploadResponseSchema.safeParse({
      fileId,
      uploadUrl: 'https://storage.test/',
      headers: { 'content-type': 'application/pdf' },
      expiresAt: '2026-10-08T00:00:00.000Z',
    }).success,
  ).toBe(true);
  expect(
    downloadResponseSchema.safeParse({
      url: 'https://storage.test/',
      expiresAt: '2026-10-08T00:00:00.000Z',
    }).success,
  ).toBe(true);
});

it.each([
  'payment_proof',
  'resident_document',
  'verification_document',
  'chat_attachment',
  'complaint_attachment',
])('SEC-003: private document purpose %s retains the API 01 JPEG/PNG/PDF allow-list', (purpose) => {
  expect(
    uploadSchema.safeParse({
      purpose,
      fileName: 'private.webp',
      mimeType: 'image/webp',
      sizeBytes: 100,
    }).success,
  ).toBe(false);
});
