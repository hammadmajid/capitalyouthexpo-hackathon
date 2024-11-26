import { expect, it } from 'vitest';
import { canSkipSetupStep, setupStepKeys } from './owner-setup-steps';

it('BRN-001 / VISIT-001: the overview, progress and wizard navigation use the requested order', () => {
  expect(setupStepKeys).toEqual([
    'basics',
    'location',
    'amenities',
    'policies',
    'photos',
    'visits',
    'rooms',
    'payments',
    'staff',
    'review',
  ]);
});
it('CHG-039: Staff keeps Skip for now even with stale room drill-down params', () => {
  expect(canSkipSetupStep('staff', true, 'hostel', true)).toBe(true);
  expect(canSkipSetupStep('staff', true, undefined, false)).toBe(false);
  expect(canSkipSetupStep('rooms', true, 'hostel', true)).toBe(false);
  expect(canSkipSetupStep('basics', false, 'hostel', false)).toBe(false);
});
