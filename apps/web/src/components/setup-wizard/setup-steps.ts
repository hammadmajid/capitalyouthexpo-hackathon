import type { HostelOnboarding } from '@hsm/contracts';
// HSM-SETUP: the same ten steps, in the same order, as the mobile Hostel Setup wizard.
export const setupStepKeys = [
  'basics',
  'location',
  'amenities',
  'policies',
  'photos',
  // VISIT-001: optional one-time visiting hours; requests are handled in Visits.
  'visits',
  'rooms',
  // CHG-050: the accounts residents pay into (moved out of Policies).
  'payments',
  // CHG-039: optional; skipping stores nothing.
  'staff',
  'review',
] as const;
export type SetupStep = (typeof setupStepKeys)[number];
export const stepCopy: Record<
  SetupStep,
  { title: string; description: string; optional: boolean }
> = {
  basics: { title: 'Basic Information', description: 'Name, type and about', optional: false },
  location: {
    title: 'Location & Address',
    description: 'Select location on map and add details',
    optional: false,
  },
  amenities: {
    title: 'Amenities & Services',
    description: 'Select available amenities',
    optional: true,
  },
  policies: {
    title: 'Hostel Policies & Agreements',
    description: 'Rent terms and policies',
    optional: true,
  },
  photos: {
    title: 'Photos & Gallery',
    description: 'Upload photos of your property',
    optional: true,
  },
  visits: {
    title: 'Visiting Hours',
    description: 'Days and times customers can visit',
    optional: true,
  },
  rooms: {
    title: 'Building & Rooms',
    description: 'Buildings, floors, rooms and beds',
    optional: true,
  },
  payments: {
    title: 'Payment Methods',
    description: 'Accounts residents pay into',
    optional: true,
  },
  staff: { title: 'Staff', description: 'Add staff · salary optional', optional: true },
  review: {
    title: 'Review & Submit',
    description: 'Check details and submit for verification',
    optional: false,
  },
};
export function parseSetupStep(value: unknown): SetupStep | undefined {
  return setupStepKeys.find((key) => key === value);
}
export function canSkipSetupStep(step: SetupStep, optional: boolean, brandId: string | undefined) {
  return optional && Boolean(brandId) && step !== 'review';
}
// HSM-SETUP (SRS v2.14): the server submit gate is HostelOnboarding.missingFields only.
export const editableStatuses = ['draft', 'changes_requested', 'rejected'];
export function isEditable(data: HostelOnboarding | undefined) {
  const status = data?.mainBranch?.verificationStatus;
  return !status || editableStatuses.includes(status);
}
// CHG-041: an approved branch stays live. Only its name and location need HSM review; a branch
// still waiting for a decision stays locked.
export function setupStepLocked(data: HostelOnboarding | undefined, step: SetupStep) {
  if (step === 'review' || isEditable(data)) return false;
  const approved = data?.mainBranch?.verificationStatus === 'approved';
  return !approved || step === 'basics' || step === 'location';
}
// BRN-001: one main branch per hostel; more branches only once it was submitted (server rule).
export function canAddBranch(data: HostelOnboarding | undefined) {
  const status = data?.mainBranch?.isPrimary ? data.mainBranch.verificationStatus : undefined;
  return Boolean(status && status !== 'draft');
}
type Archivable = { archivedAt?: string | null };
// Saved server reads only; each field is undefined until its read returns.
export type DraftFacts = {
  inventory?: { rooms: (Archivable & { seats: Archivable[] })[] } | undefined;
  gallery?: { data: unknown[] } | undefined;
  listing?: { amenities: unknown[] } | undefined;
  policy?: { effectiveVersion?: unknown } | undefined;
  staff?: { data: unknown[] } | undefined;
  visits?: { windows: unknown[] } | undefined;
  payments?: { data: unknown[] } | undefined;
};
export function draftProgress(data: HostelOnboarding | undefined, facts: DraftFacts) {
  const missing = new Set(data?.missingFields ?? ['main_branch']);
  const rooms = (facts.inventory?.rooms ?? []).filter((room) => !room.archivedAt);
  const beds = rooms.reduce(
    (total, room) => total + room.seats.filter((seat) => !seat.archivedAt).length,
    0,
  );
  const status = data?.mainBranch?.verificationStatus;
  return {
    basics: Boolean(data) && !missing.has('category'),
    location: Boolean(data) && !['city', 'area', 'address', 'location'].some((f) => missing.has(f)),
    rooms: rooms.length > 0 && beds > 0,
    photos: (facts.gallery?.data ?? []).length > 0,
    amenities: (facts.listing?.amenities ?? []).length > 0,
    policies: Boolean(facts.policy?.effectiveVersion),
    visits: (facts.visits?.windows ?? []).length > 0,
    payments: (facts.payments?.data ?? []).length > 0,
    staff: (facts.staff?.data ?? []).length > 0,
    review: Boolean(status && status !== 'draft'),
    roomCount: rooms.length,
    bedCount: beds,
    ready: Boolean(data) && missing.size === 0,
  };
}
export type DraftProgress = ReturnType<typeof draftProgress>;
export function nextSetupStep(progress: DraftProgress): SetupStep {
  return setupStepKeys.find((key) => !progress[key]) ?? 'review';
}
