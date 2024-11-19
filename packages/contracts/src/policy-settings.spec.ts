import { expect, it } from 'vitest';
import {
  bookingPolicyReadSchema,
  platformBookingSettingsSchema,
  bookingOverrideInputSchema,
  bookingPolicyVersionSchema,
  bookingPolicyVersionsSchema,
} from './policy-settings.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it('CHG-007 BKG-006: Root configuration requires every explicit safety value; Owner overrides cannot disable platform security', () => {
  const policy = {
    bookingMode: 'instant',
    holdSeconds: 0,
    requestExpirySeconds: 3600,
    requestReservesInventory: false,
    minimumStayDays: 1,
    maximumStayDays: 'unlimited',
    minimumAdvanceDays: 0,
    maximumAdvanceDays: 90,
    customerSelectsInventory: false,
    cancellationAllowed: true,
    cancellationCutoffHours: 0,
    requiredDocuments: [],
    allowedStayUnits: ['day'],
    allowEvidenceReuse: true,
    documentReviewRequired: false,
  };
  const limits = {
    maximumHoldSeconds: 3600,
    maximumActiveHolds: 3,
    maximumRequestExpirySeconds: 86400,
    maximumAdvanceDays: 365,
    maximumFiniteStayDays: 730,
  };
  expect(platformBookingSettingsSchema.parse({ policy, limits })).toEqual({ policy, limits });
  expect(() => platformBookingSettingsSchema.parse({ policy, limits: {} })).toThrow();
  expect(() => bookingOverrideInputSchema.parse({ overrides: { disableAudit: true } })).toThrow();
  expect(
    bookingOverrideInputSchema.parse({ overrides: { requiredDocuments: [], holdSeconds: null } })
      .overrides.requiredDocuments,
  ).toEqual([]);
  const version = { id, level: 'platform', scopeId: null };
  expect(bookingPolicyVersionSchema.parse(version)).toEqual(version);
  expect(bookingPolicyVersionsSchema.parse({ versions: [version] }).versions).toHaveLength(1);
});

it('BKG-006: unconfigured policy reads cannot contain invented effective settings', () => {
  const value = { configured: false, target: { level: 'platform', scopeId: null }, canEdit: true };
  expect(bookingPolicyReadSchema.parse(value)).toEqual(value);
  expect(() => bookingPolicyReadSchema.parse({ ...value, effective: {} })).toThrow();
  expect(() => bookingPolicyReadSchema.parse({ ...value, canEdit: 'true' })).toThrow();
  expect(() => bookingPolicyReadSchema.parse({ ...value, configured: true })).toThrow();
});
