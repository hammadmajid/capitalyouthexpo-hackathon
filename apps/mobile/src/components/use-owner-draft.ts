import { useQuery } from '@tanstack/react-query';
import {
  listListingGallery,
  listOwnerHostels,
  listOwnerOrganizations,
  readBranchInventory,
  readBillingSettings,
  readListingSettings,
  readOwnerBranchSetup,
  readOwnerHostel,
  listStaff,
  readVisitingHours,
  branchPaymentInstructions,
} from '@hsm/api-client';
import type { HostelOnboarding } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
export { setupStepKeys } from './owner-setup-steps';
import { setupStepKeys } from './owner-setup-steps';
import { staffKey } from './staff/staff-shared';
export type SetupStep = (typeof setupStepKeys)[number];
export function parseSetupStep(value: unknown): SetupStep | undefined {
  return setupStepKeys.find((key) => key === value);
}
// HSM-SETUP (SRS v2.14): the server submit gate is HostelOnboarding.missingFields only.
export const editableStatuses = ['draft', 'changes_requested', 'rejected'];
export function isEditable(data: HostelOnboarding | undefined) {
  const status = data?.mainBranch?.verificationStatus;
  return !status || editableStatuses.includes(status);
}
// CHG-041: an approved branch stays live. Rooms, photos, amenities, policies, visiting hours
// and staff change directly; only its name and location need HSM review (the main branch uses
// the revision flow). A branch still waiting for a decision stays locked.
export function setupStepLocked(data: HostelOnboarding | undefined, step: string) {
  if (step === 'review' || isEditable(data)) return false;
  const approved = data?.mainBranch?.verificationStatus === 'approved';
  return !approved || step === 'basics' || step === 'location';
}
// BRN-001: one main branch per hostel; more branches only once it was submitted (server rule).
export function canAddBranch(data: HostelOnboarding | undefined) {
  const status = data?.mainBranch?.isPrimary ? data.mainBranch.verificationStatus : undefined;
  return Boolean(status && status !== 'draft');
}
export function useOwnerOrganization(actorId: string) {
  return useQuery({
    queryKey: ['owner-organizations', actorId],
    retry: false,
    queryFn: () =>
      withFreshSession(
        async () => (await listOwnerOrganizations(await actorClient(actorId), { limit: 20 })).data,
      ),
  });
}
export function useOwnerHostels(actorId: string, organizationId: string | undefined) {
  return useQuery({
    queryKey: ['owner-hostels', actorId, organizationId],
    enabled: Boolean(organizationId),
    retry: false,
    queryFn: () =>
      withFreshSession(
        async () =>
          (await listOwnerHostels(await actorClient(actorId), organizationId ?? '', { limit: 100 }))
            .data,
      ),
  });
}
// BRN-001: with branchId the setup reads that additional branch; mainBranch is that branch.
export function useOwnerHostel(actorId: string, brandId: string | undefined, branchId?: string) {
  return useQuery({
    queryKey: ['owner-hostel', actorId, brandId, branchId ?? 'main'],
    enabled: Boolean(brandId),
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () =>
      withFreshSession(async () => {
        const client = await actorClient(actorId);
        return branchId
          ? readOwnerBranchSetup(client, brandId ?? '', branchId)
          : readOwnerHostel(client, brandId ?? '');
      }),
  });
}
/** Supporting reads for optional steps; each reflects saved server state, never local flags. */
export function useOwnerDraftDetails(actorId: string, branchId: string | undefined) {
  const enabled = Boolean(branchId),
    id = branchId ?? '';
  const inventory = useQuery({
    queryKey: ['branch-inventory-pages', actorId, branchId, 'summary'],
    enabled,
    retry: false,
    queryFn: () =>
      withFreshSession(async () => readBranchInventory(await actorClient(actorId), id)),
  });
  const gallery = useQuery({
    queryKey: ['owner-gallery', actorId, branchId, 'hostel'],
    enabled,
    retry: false,
    queryFn: () =>
      withFreshSession(async () =>
        listListingGallery(await actorClient(actorId), id, { limit: 100 }),
      ),
  });
  const listing = useQuery({
    queryKey: ['owner-listing', actorId, branchId],
    enabled,
    retry: false,
    queryFn: () =>
      withFreshSession(async () => readListingSettings(await actorClient(actorId), id)),
  });
  const policy = useQuery({
    queryKey: ['billing-policy', actorId, branchId, 'branch'],
    enabled,
    retry: false,
    queryFn: () =>
      withFreshSession(async () =>
        readBillingSettings(await actorClient(actorId), { branchId: id }),
      ),
  });
  const staff = useQuery({
    queryKey: [...staffKey(actorId, id), 'setup'],
    enabled,
    retry: false,
    queryFn: () =>
      withFreshSession(async () => listStaff(await actorClient(actorId), id, { limit: 1 })),
  });
  const visits = useQuery({
    queryKey: ['visits', actorId, 'hours', id],
    enabled,
    retry: false,
    queryFn: () => withFreshSession(async () => readVisitingHours(await actorClient(actorId), id)),
  });
  // CHG-050: the accounts residents pay into (same key as the Payment methods step).
  const payments = useQuery({
    queryKey: ['payment-instructions', actorId, id],
    enabled,
    retry: false,
    queryFn: () =>
      withFreshSession(async () => branchPaymentInstructions(await actorClient(actorId), id)),
  });
  return { inventory, gallery, listing, policy, staff, visits, payments };
}
export type DraftDetails = ReturnType<typeof useOwnerDraftDetails>;
export function draftProgress(data: HostelOnboarding | undefined, details: DraftDetails) {
  const missing = new Set(data?.missingFields ?? ['main_branch']);
  const rooms = (details.inventory.data?.rooms ?? []).filter((room) => !room.archivedAt);
  const beds = rooms.reduce(
    (total, room) => total + room.seats.filter((seat) => !seat.archivedAt).length,
    0,
  );
  const status = data?.mainBranch?.verificationStatus;
  return {
    basics: Boolean(data) && !missing.has('category'),
    location: Boolean(data) && !['city', 'area', 'address', 'location'].some((f) => missing.has(f)),
    rooms: rooms.length > 0 && beds > 0,
    photos: (details.gallery.data?.data ?? []).length > 0,
    amenities: (details.listing.data?.amenities ?? []).length > 0,
    policies: Boolean(details.policy?.data?.effectiveVersion),
    visits: (details.visits?.data?.windows ?? []).length > 0,
    payments: (details.payments?.data?.data ?? []).length > 0,
    staff: (details.staff?.data?.data ?? []).length > 0,
    review: Boolean(status && status !== 'draft'),
    roomCount: rooms.length,
    bedCount: beds,
    ready: Boolean(data) && missing.size === 0,
  };
}
export type DraftProgress = ReturnType<typeof draftProgress>;
