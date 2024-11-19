import { expect, it } from 'vitest';
import {
  billingPolicyVersionSchema,
  billingSettingsInputSchema,
  billingSettingsReadSchema,
  billingSettingsTargetSchema,
} from './billing-settings.js';
const id = '019a1234-1234-7123-8123-123456789abc';
const policy = {
  cycle: { kind: 'week', dueOffsetDays: 0 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 7,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'disabled',
};
const version = { id, level: 'branch', scopeId: id, policy, createdAt: '2028-02-01T06:00:00.000Z' };
it('RENT-001 / ACC-004: canonical scoped settings reject injected parent identifiers', () => {
  expect(
    billingSettingsTargetSchema.parse({ branchId: id.toUpperCase(), roomTypeId: id.toUpperCase() }),
  ).toEqual({ branchId: id, roomTypeId: id });
  expect(billingSettingsTargetSchema.safeParse({ branchId: id, ownerId: id }).success).toBe(false);
  expect(billingSettingsInputSchema.parse({ policy })).toEqual({ policy });
  expect(billingSettingsInputSchema.safeParse({ policy, isCurrent: true }).success).toBe(false);
});
it('RENT-001/003: missing configuration stays explicitly absent rather than inventing money rules', () => {
  const empty = {
    target: { branchId: id },
    canEdit: false,
    localVersion: null,
    effectiveVersion: null,
  };
  expect(billingSettingsReadSchema.parse(empty)).toEqual(empty);
  expect(
    billingSettingsReadSchema.parse({
      ...empty,
      canEdit: true,
      localVersion: version,
      effectiveVersion: version,
    }),
  ).toEqual({ ...empty, canEdit: true, localVersion: version, effectiveVersion: version });
});
it.each(['platform', 'hostel', 'branch', 'room_type'])(
  'RENT-003: %s immutable policy version has exact lineage',
  (level) => {
    const value = { ...version, level, scopeId: level === 'platform' ? null : id };
    expect(billingPolicyVersionSchema.parse(value)).toEqual(value);
    expect(
      billingPolicyVersionSchema.safeParse({ ...value, scopeId: level === 'platform' ? id : null })
        .success,
    ).toBe(false);
  },
);
