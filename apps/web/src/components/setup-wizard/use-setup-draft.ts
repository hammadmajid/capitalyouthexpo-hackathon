'use client';
import { useQuery } from '@tanstack/react-query';
import {
  branchPaymentInstructions,
  listListingGallery,
  listStaff,
  readBillingSettings,
  readBranchInventory,
  readListingSettings,
  readOwnerBranchSetup,
  readOwnerHostel,
  readVisitingHours,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { draftProgress, type DraftFacts } from './setup-steps';
// BRN-001: the wizard edits the main branch, an additional branch, or a branch being added.
export type SetupTarget = { branchId?: string; adding?: boolean };
export function setupHostelKey(actorId: string, brandId: string, branchId?: string) {
  return branchId
    ? ['owner-hostel', actorId, brandId, branchId]
    : ['owner-hostel', actorId, brandId];
}
// With branchId the read returns that branch as mainBranch (same shape as the hostel setup).
export function useSetupHostel(actorId: string, brandId: string, branchId?: string) {
  return useQuery({
    queryKey: setupHostelKey(actorId, brandId, branchId),
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () =>
      branchId
        ? readOwnerBranchSetup(browserClient(), brandId, branchId)
        : readOwnerHostel(browserClient(), brandId),
  });
}
function useFact<T>(key: string, branchId: string | undefined, read: (id: string) => Promise<T>) {
  return useQuery({
    queryKey: ['setup-progress', key, branchId],
    enabled: Boolean(branchId),
    retry: false,
    queryFn: () => read(branchId ?? ''),
  });
}
// Supporting reads for the optional steps; each reflects saved server state, never local flags.
export function useSetupFacts(branchId: string | undefined): DraftFacts {
  const inventory = useFact('inventory', branchId, (id) =>
      readBranchInventory(browserClient(), id),
    ),
    gallery = useFact('gallery', branchId, (id) =>
      listListingGallery(browserClient(), id, { limit: 100 }),
    ),
    listing = useFact('listing', branchId, (id) => readListingSettings(browserClient(), id)),
    policy = useFact('policy', branchId, (id) =>
      readBillingSettings(browserClient(), { branchId: id }),
    ),
    staff = useFact('staff', branchId, (id) => listStaff(browserClient(), id, { limit: 1 })),
    visits = useFact('visits', branchId, (id) => readVisitingHours(browserClient(), id)),
    payments = useFact('payments', branchId, (id) =>
      branchPaymentInstructions(browserClient(), id),
    );
  return {
    inventory: inventory.data,
    gallery: gallery.data,
    listing: listing.data,
    policy: policy.data,
    staff: staff.data,
    visits: visits.data,
    payments: payments.data,
  };
}
export function useSetupProgress(actorId: string, brandId: string, target: SetupTarget = {}) {
  const hostel = useSetupHostel(actorId, brandId, target.branchId),
    // A branch being added has no saved data yet; the main branch read is only its template.
    draft = target.adding ? undefined : hostel.data,
    facts = useSetupFacts(draft?.mainBranch?.id);
  return { hostel, progress: draftProgress(draft, facts) };
}
