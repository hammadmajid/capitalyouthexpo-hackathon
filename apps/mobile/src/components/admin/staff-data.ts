import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ApiClient } from '@hsm/api-client';
import { useAdminData } from './data';
export function useStaffPages<T>(
  name: string,
  load: (client: ApiClient, cursor?: string) => Promise<{ data: T[]; nextCursor: string | null }>,
  filters: object = {},
) {
  const data = useAdminData();
  const query = useInfiniteQuery({
    queryKey: [...data.key, name, filters],
    enabled: data.active,
    initialPageParam: undefined as string | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) => data.read((client) => load(client, pageParam), signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const hidden = query.isError;
  return {
    ...query,
    loadingKind: 'list' as const,
    refreshMasked: false,
    rows: hidden ? [] : (query.data?.pages.flatMap((p) => p.data) ?? []),
  };
}
export function useStaffRecord<T>(
  name: string,
  id: string,
  load: (client: ApiClient) => Promise<T>,
) {
  const data = useAdminData();
  const query = useQuery({
    queryKey: [...data.key, name, id],
    retry: false,
    gcTime: 0,
    enabled: Boolean(id) && data.active,
    queryFn: ({ signal }) => data.read(load, signal),
  });
  return {
    ...query,
    loadingKind: 'details' as const,
    refreshMasked: false,
    record: query.isError ? undefined : query.data,
  };
}
