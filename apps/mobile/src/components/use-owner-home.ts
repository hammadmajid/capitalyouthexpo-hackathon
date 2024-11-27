import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { listNotifications, readApi, readOwnerDashboard } from '@hsm/api-client';
import { branchSummarySchema } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { useOwnerHostels, useOwnerOrganization } from './use-owner-draft';
const branchPage = z
  .object({ data: z.array(branchSummarySchema), nextCursor: z.string().uuid().nullable() })
  .strict();
// OWN-001..004: dashboard numbers come only from the scoped owner dashboard endpoint; the
// branch list adds each branch's hostel so draft cards can resume the correct setup.
export function useOwnerHome(actorId: string, month?: string, branchId?: string) {
  const organizations = useOwnerOrganization(actorId);
  const organization = organizations.data?.[0];
  const hostels = useOwnerHostels(actorId, organization?.id);
  const hasHostels = (hostels.data?.length ?? 0) > 0;
  const dashboard = useQuery({
    queryKey: ['owner-dashboard', actorId, month ?? 'current', branchId ?? 'all'],
    enabled: hasHostels,
    retry: false,
    queryFn: () =>
      withFreshSession(async () =>
        readOwnerDashboard(await actorClient(actorId), {
          ...(month ? { month } : {}),
          ...(branchId ? { branchId } : {}),
        }),
      ),
  });
  const branches = useQuery({
    queryKey: ['branches', actorId, 'owner', 'home'],
    enabled: hasHostels,
    retry: false,
    queryFn: () =>
      withFreshSession(async () =>
        readApi(
          (await actorClient(actorId)).GET('/v1/owner/branches', {
            params: { query: { limit: 50 } },
          }),
          branchPage,
        ),
      ),
  });
  const notices = useQuery({
    queryKey: ['notifications', actorId, 'owner-home'],
    retry: false,
    queryFn: () =>
      withFreshSession(async () => listNotifications(await actorClient(actorId), { limit: 5 })),
  });
  const loading =
    organizations.isPending ||
    (Boolean(organization) && hostels.isPending) ||
    (hasHostels && (dashboard.isPending || branches.isPending));
  const error = organizations.error ?? hostels.error;
  return {
    organization,
    organizations,
    hostels,
    dashboard,
    notices,
    branches,
    loading,
    error,
  };
}
export type OwnerHomeData = ReturnType<typeof useOwnerHome>;
