import { formatExactMoney, moneyFromJson } from '@hsm/contracts';
// OWN-001 / BR-05: verification wording follows the server status exactly; a draft or a
// submitted branch is never described as approved, active or publicly visible.
const labels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted for verification',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Not approved',
  suspended: 'Suspended',
};
export function verificationLabel(status: string) {
  return labels[status] ?? 'Status unavailable';
}
export function verificationTone(status: string): 'neutral' | 'success' | 'warning' | 'info' {
  if (status === 'approved') return 'success';
  if (['changes_requested', 'rejected', 'suspended'].includes(status)) return 'warning';
  if (['submitted', 'under_review'].includes(status)) return 'info';
  return 'neutral';
}
export const hostelTypeLabels: Record<string, string> = {
  boys: 'Male',
  girls: 'Female',
  working_male: 'Male (working professionals, legacy)',
  working_female: 'Female (working professionals, legacy)',
};
export const tierLabels: Record<string, string> = {
  standard: 'Standard',
  premium: 'Premium',
  luxury: 'Luxury',
};
// Money is integer paisa end to end; display keeps every paisa (FIN-001).
export function paisaText(value: number) {
  return formatExactMoney(moneyFromJson(value));
}
