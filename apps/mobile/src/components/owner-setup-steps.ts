export const setupStepKeys = [
  'basics',
  'location',
  'amenities',
  'policies',
  'photos',
  // VISIT-001: optional one-time visiting hours; requests are handled in Operations › Visits.
  'visits',
  'rooms',
  // CHG-050: the accounts residents pay into (moved out of Policies), step 8.
  'payments',
  // CHG-039: optional; skipping stores nothing.
  'staff',
  'review',
] as const;

// Drill-down params belong to Rooms, not to a later optional step such as Staff.
export function canSkipSetupStep(
  step: (typeof setupStepKeys)[number],
  optional: boolean,
  brandId: string | undefined,
  drillDown: boolean,
) {
  return optional && Boolean(brandId) && (step !== 'rooms' || !drillDown);
}
