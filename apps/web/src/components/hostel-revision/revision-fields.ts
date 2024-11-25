import { mainBranchDraftSchema } from '@hsm/contracts';
import type { HostelOnboarding, HostelRevision, HostelRevisionReview } from '@hsm/contracts';
// CHG-041: the fields an Owner may change on an approved hostel, with the names people see.
export const revisionLabels: Record<string, string> = {
  name: 'Name',
  logoFileId: 'Logo',
  category: 'Hostel type',
  description: 'About',
  phone: 'Phone',
  showPublicContact: 'Show contact',
  propertyTier: 'Property tier',
  establishmentYear: 'Year established',
  cityId: 'City',
  areaId: 'Area',
  subAreaId: 'Sub-area',
  addressLine: 'Address',
  location: 'Map pin',
  nearbyLandmark: 'Landmark',
};
const placeKeys = new Set(['cityId', 'areaId', 'subAreaId']);
// CHG-041: an approved main branch is edited through a pending revision; unapproved hostels
// keep the normal setup flow.
export function usesRevision(data: HostelOnboarding | undefined) {
  return data?.mainBranch?.verificationStatus === 'approved';
}
export function openRevision(revision: HostelRevision | null | undefined) {
  return revision && (revision.status === 'draft' || revision.status === 'submitted')
    ? revision
    : null;
}
function liveValues(live: HostelOnboarding): Record<string, unknown> {
  return { ...(live.mainBranch ?? {}), name: live.name, logoFileId: live.logoFileId };
}
function proposedValues(revision: HostelRevision): Record<string, unknown> {
  return { ...(revision.changes.basics ?? {}), ...(revision.changes.main ?? {}) };
}
// Each changed field with what customers see now and what the Owner asked for.
export function revisionRows(review: Pick<HostelRevisionReview, 'live' | 'revision'>) {
  const live = liveValues(review.live),
    proposed = proposedValues(review.revision);
  return Object.keys(revisionLabels)
    .filter(
      (key) =>
        key in proposed &&
        JSON.stringify(proposed[key] ?? null) !== JSON.stringify(live[key] ?? null),
    )
    .map((key) => ({
      key,
      label: revisionLabels[key] ?? key,
      now: live[key],
      next: proposed[key],
    }));
}
export function changedFields(live: HostelOnboarding, revision: HostelRevision) {
  return [...new Set(revisionRows({ live, revision }).map((row) => row.label))];
}
// Places show by name, the map pin by its coordinates, the logo only as changed.
export function revisionValue(key: string, value: unknown, names: Record<string, string> = {}) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (placeKeys.has(key) && typeof value === 'string') return names[value] ?? 'Unknown place';
  if (key === 'logoFileId') return 'Logo image';
  if (typeof value === 'object') {
    const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
    return typeof latitude === 'number' && typeof longitude === 'number'
      ? latitude.toFixed(5) + ', ' + longitude.toFixed(5)
      : 'Map pin';
  }
  return String(value).replaceAll('_', ' ');
}
// Show the Owner's unsent edits on top of the live values so the form opens where they left off.
export function withRevision(data: HostelOnboarding, open: HostelRevision | null) {
  if (!open || !data.mainBranch) return data;
  const { basics, main } = open.changes;
  const { name, logoFileId, ...fields } = basics ?? {};
  return {
    ...data,
    name: name ?? data.name,
    logoFileId: logoFileId ?? data.logoFileId,
    mainBranch: mainBranchDraftSchema.parse({ ...data.mainBranch, ...fields, ...(main ?? {}) }),
  };
}
