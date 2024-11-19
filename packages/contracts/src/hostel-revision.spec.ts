import { expect, it } from 'vitest';
import {
  hostelRevisionChangesSchema,
  hostelRevisionDecisionSchema,
  saveHostelRevisionSchema,
} from './hostel-revision.js';
it('CHG-041: a save must carry basics or location', () => {
  expect(saveHostelRevisionSchema.safeParse({ expectedVersion: null }).success).toBe(false);
  expect(
    saveHostelRevisionSchema.safeParse({ expectedVersion: null, basics: { name: 'Hostel' } })
      .success,
  ).toBe(true);
  expect(
    saveHostelRevisionSchema.safeParse({
      expectedVersion: 1,
      main: { name: 'Hostel', addressLine: 'Street 12' },
      extra: true,
    }).success,
  ).toBe(false);
});
it('CHG-041: rejecting needs a reason; approving does not', () => {
  expect(
    hostelRevisionDecisionSchema.safeParse({ expectedVersion: 1, action: 'approve' }).success,
  ).toBe(true);
  expect(
    hostelRevisionDecisionSchema.safeParse({ expectedVersion: 1, action: 'reject' }).success,
  ).toBe(false);
  expect(
    hostelRevisionDecisionSchema.safeParse({
      expectedVersion: 1,
      action: 'reject',
      reason: 'Wrong address',
    }).success,
  ).toBe(true);
});
it('CHG-041: stored changes always hold both parts, each possibly empty', () => {
  expect(hostelRevisionChangesSchema.safeParse({ basics: null, main: null }).success).toBe(true);
  expect(hostelRevisionChangesSchema.safeParse({ basics: null }).success).toBe(false);
});
