import { expect, it } from 'vitest';
import {
  identityCorrectionInputSchema,
  profileReviewMetadataSchema,
  profileReviewQuerySchema,
} from './admin-profile-review.js';
const id = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
it('HMA-015: identity correction requires changed fields, meaningful reason and distinct proof', () => {
  const input = { reason: 'Correct documented legal identity', evidenceFileIds: [id] };
  expect(identityCorrectionInputSchema.safeParse(input).success).toBe(false);
  expect(
    identityCorrectionInputSchema.safeParse({ ...input, fullName: 'Verified Name' }).success,
  ).toBe(true);
  expect(
    identityCorrectionInputSchema.safeParse({ ...input, cnic: '12345-1234567-1' }).success,
  ).toBe(false);
  expect(
    identityCorrectionInputSchema.parse({
      ...input,
      cnic: '12345-1234567-1',
      evidenceFileIds: [id, other],
    }).cnic,
  ).toBe('1234512345671');
  expect(
    identityCorrectionInputSchema.safeParse({
      ...input,
      fullName: 'Name',
      evidenceFileIds: [id, id],
    }).success,
  ).toBe(false);
  expect(
    identityCorrectionInputSchema.safeParse({ ...input, fullName: 'Name', phone: '+923000000000' })
      .success,
  ).toBe(false);
});
it('HMA-015 SEC-003: metadata excludes proposed identity, keys, ciphertext and document URLs', () => {
  const row = {
    id,
    userId: other,
    kind: 'identity',
    status: 'pending',
    version: 1,
    submittedAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  };
  expect(profileReviewMetadataSchema.safeParse(row).success).toBe(true);
  for (const extra of [
    { cnic: '1234512345671' },
    { proposedFullName: 'Private Name' },
    { objectKey: 'private/key' },
    { proposedCnicEncrypted: 'secret' },
    { url: 'https://private.example.test' },
  ])
    expect(profileReviewMetadataSchema.safeParse({ ...row, ...extra }).success).toBe(false);
  expect(profileReviewQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
});
