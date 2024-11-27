import { useEffect } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readBranchRoutes, readInventoryAccess } from '@hsm/api-client';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { SetupText } from '../owner-wizard-ui';
import { TransportPlaces } from './transport-places';
import { TransportMonthlySubscription } from './transport-monthly-subscription';
import { Skeleton } from '../loading/skeleton';
// SERV-002 / CHG-049: where transport is available is set in Amenities & Services.
export function TransportSetup({
  actorId,
  branchId,
  onOpenChange,
}: {
  actorId: string;
  branchId: string;
  // Hostel Setup holds Continue while a route form is open, so it is never dropped.
  onOpenChange?: (open: boolean) => void;
}) {
  const routes = useQuery({
    queryKey: ['transport-routes', actorId, branchId],
    gcTime: 0,
    retry: false,
    queryFn: async () => readBranchRoutes(await actorClient(actorId), branchId),
  });
  const access = useQuery({
    queryKey: ['transport-access', actorId, branchId],
    gcTime: 0,
    retry: false,
    queryFn: async () => readInventoryAccess(await actorClient(actorId), branchId),
  });
  const listed = routes.data?.data ?? [];
  const canSetUp =
    routes.isSuccess &&
    access.isSuccess &&
    !access.isFetching &&
    access.data.permissions.includes('listing_edit') &&
    access.data.permissions.includes('pricing_edit');
  const grants = access.data?.permissions ?? [];
  const canManageSubscription = grants.includes('finance_view') && grants.includes('rent_manage');
  const failure = routes.error ?? access.error;
  // No form opens here any more; places save as they are added.
  useEffect(() => onOpenChange?.(false), [onOpenChange]);
  return (
    <View className="gap-3">
      {failure ? (
        <SetupText alert>{safeMessage(failure)}</SetupText>
      ) : routes.isPending || access.isPending ? (
        <Skeleton kind="inline" label="Loading transport…" />
      ) : (
        <>
          <TransportPlaces
            actorId={actorId}
            branchId={branchId}
            routes={listed}
            canEdit={canSetUp}
          />
          {canManageSubscription ? (
            <TransportMonthlySubscription actorId={actorId} branchId={branchId} />
          ) : null}
        </>
      )}
    </View>
  );
}
