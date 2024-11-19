import { expect, it } from 'vitest';
import {
  verificationSnapshotComparisonSchema,
  verificationSnapshotItemQuerySchema,
} from './admin-verification-snapshots.js';
it('TRUST-002: comparison accepts explicit absence but refuses arbitrary JSON diff fields', () => {
  expect(
    verificationSnapshotComparisonSchema.parse({
      current: null,
      lastApproved: null,
      changedFields: [],
      historicalSnapshotUnavailable: true,
    }).current,
  ).toBeNull();
  expect(
    verificationSnapshotComparisonSchema.safeParse({
      current: null,
      lastApproved: null,
      changedFields: ['passwordHash'],
      historicalSnapshotUnavailable: true,
    }).success,
  ).toBe(false);
});
it('TRUST-002: snapshot readers only accept bounded pricing/photo kind pages', () => {
  expect(verificationSnapshotItemQuerySchema.safeParse({ kind: 'fingerprint' }).success).toBe(
    false,
  );
  expect(verificationSnapshotItemQuerySchema.safeParse({ kind: 'photo', limit: 51 }).success).toBe(
    false,
  );
});
