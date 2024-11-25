import {
  bookingPolicySchema,
  bookingPolicyOverrideSchema,
  platformBookingSettingsSchema,
} from '@hsm/contracts';
export const policyNumbers = [
  ['holdSeconds', 'Hold duration (seconds)'],
  ['requestExpirySeconds', 'Request expiry (seconds)'],
  ['minimumStayDays', 'Minimum stay (days)'],
  ['maximumStayDays', 'Maximum stay (days or unlimited)'],
  ['minimumAdvanceDays', 'Minimum advance (days)'],
  ['maximumAdvanceDays', 'Maximum advance (days)'],
  ['cancellationCutoffHours', 'Cancellation cutoff (hours)'],
] as const;
export const policyBooleans = [
  ['requestReservesInventory', 'Reserve inventory for pending requests'],
  ['customerSelectsInventory', 'Customer chooses inventory'],
  ['cancellationAllowed', 'Allow cancellation'],
  ['allowEvidenceReuse', 'Allow approved document reuse'],
  ['documentReviewRequired', 'Require document review'],
] as const;
export const policyLists = [
  ['allowedStayUnits', 'Allowed stay units', ['day', 'week', 'month']],
  [
    'requiredDocuments',
    'Required documents',
    ['cnic', 'student_id', 'admission_proof', 'employment_proof'],
  ],
] as const;
export const limitNumbers = Object.entries({
  maximumHoldSeconds: 'Maximum hold (seconds)',
  maximumActiveHolds: 'Maximum active holds',
  maximumRequestExpirySeconds: 'Maximum request expiry (seconds)',
  maximumAdvanceDays: 'Maximum advance limit (days)',
  maximumFiniteStayDays: 'Maximum finite stay (days)',
});

export type PolicyFormValues = Record<string, string>;
export function policyFormValues(value: unknown): PolicyFormValues {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      entry === null || entry === undefined
        ? policyLists.some(([field]) => field === key)
          ? 'inherit'
          : ''
        : Array.isArray(entry)
          ? entry.join(',')
          : String(entry),
    ]),
  );
}
function numeric(value: string | undefined) {
  if (value === undefined || value === '') return null;
  if (!/^\d{1,10}$/.test(value)) throw new Error('Invalid integer');
  return Number(value);
}
export function parsePolicyForm(values: PolicyFormValues, root: boolean, limits: PolicyFormValues) {
  const policy: Record<string, unknown> = {};
  for (const [field] of policyNumbers)
    policy[field] =
      field === 'maximumStayDays' && values[field] === 'unlimited'
        ? 'unlimited'
        : numeric(values[field]);
  policy.bookingMode = values.bookingMode || null;
  for (const [field] of policyBooleans)
    policy[field] = values[field] === 'true' ? true : values[field] === 'false' ? false : null;
  for (const [field] of policyLists)
    policy[field] =
      (!root && values[field] === undefined) || values[field] === 'inherit'
        ? null
        : values[field] === undefined || values[field] === ''
          ? []
          : (values[field] ?? '').split(',');
  if (!root) return { overrides: bookingPolicyOverrideSchema.parse(policy) };
  return platformBookingSettingsSchema.parse({
    policy: bookingPolicySchema.parse(policy),
    limits: Object.fromEntries(limitNumbers.map(([field]) => [field, numeric(limits[field])])),
  });
}
