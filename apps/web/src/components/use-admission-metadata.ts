import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { readBillingSettings, readBillingCatalog } from '@hsm/api-client';
import { browserClient } from '../lib/client';
// FIN-004: exact account, branch and current room-type policy scope.
export function useAdmissionMetadata(
  actorId: string,
  branchId: string,
  roomTypeId: string | undefined,
  enabled: boolean,
) {
  const settings = useAdmissionSettings(actorId, branchId, roomTypeId, enabled),
    needsCatalog = settings.data?.effectiveVersion?.policy.customCharges === 'catalog_only',
    catalog = useAdmissionCatalog(
      actorId,
      branchId,
      enabled && needsCatalog && settingsReady(settings),
    ),
    state = catalogState(needsCatalog, catalog);
  return {
    settings,
    catalog,
    needsCatalog,
    error: settings.error ?? state.error,
    ready: settingsReady(settings) && state.ready,
    entries: state.entries,
  };
}
function useAdmissionSettings(
  actorId: string,
  branchId: string,
  roomTypeId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['billing-policy', actorId, branchId, roomTypeId],
    gcTime: 0,
    retry: false,
    enabled: enabled && Boolean(roomTypeId),
    queryFn: () => readBillingSettings(browserClient(), { branchId, roomTypeId: roomTypeId ?? '' }),
  });
}
function settingsReady(settings: ReturnType<typeof useAdmissionSettings>) {
  return (
    Boolean(settings.data?.effectiveVersion) &&
    !settings.isPending &&
    !settings.isFetching &&
    !settings.error
  );
}
function useAdmissionCatalog(actorId: string, branchId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['admission-charge-catalog', actorId, branchId],
    gcTime: 0,
    retry: false,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      readBillingCatalog(browserClient(), branchId, {
        limit: 20,
        includeArchived: 'false',
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
function catalogState(needed: boolean, query: ReturnType<typeof useAdmissionCatalog>) {
  if (!needed) return { ready: true, error: null, entries: [] };
  return {
    error: query.error,
    ready: !query.isPending && !query.error && (!query.isFetching || query.isFetchingNextPage),
    entries: query.data?.pages.flatMap((page) => page.data) ?? [],
  };
}
