import { useCallback, useRef } from 'react';
import type { z } from 'zod';
import { useFocusEffect } from 'expo-router';
import { useInfiniteQuery, useMutation, type InfiniteData } from '@tanstack/react-query';
import { ClientFailure, type ApiClient, type ProfileReviewKind } from '@hsm/api-client';
import { useAdminData } from './data';
import { moduleAllowed } from '../../lib/admin-modules';
export function useProfileReviewPages<T, C extends string | number>(
  name: string,
  load: (client: ApiClient, cursor?: C) => Promise<{ data: T[]; nextCursor: C | null }>,
  filters: object,
  own: boolean,
  cursorSchema: z.ZodType<C | undefined>,
) {
  const data = useAdminData();
  type Page = { data: T[]; nextCursor: C | null };
  const query = useInfiniteQuery<
    Page,
    Error,
    InfiniteData<Page, C | undefined>,
    readonly unknown[],
    C | undefined
  >({
    queryKey: [...data.key, 'profile-reviews', name, filters],
    enabled: data.active,
    initialPageParam: undefined as C | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      data.read((client) => load(client, cursorSchema.parse(pageParam)), signal, !own),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return {
    ...query,
    rows: query.isError ? [] : (query.data?.pages.flatMap((p) => p.data) ?? []),
  };
}
export function useProfileReviewSensitive<T, R>(
  kind: ProfileReviewKind,
  own: boolean,
  run: (client: ApiClient, input: T) => Promise<R>,
) {
  const data = useAdminData(),
    epoch = useRef(0);
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: async (input: T) => {
      const ticket = epoch.current,
        fresh = await data.session.refetch();
      if (
        fresh?.user.id !== data.actorId ||
        (!own && !moduleAllowed(fresh, kind === 'identity' ? 'identity_reviews' : 'photo_reviews'))
      )
        throw new ClientFailure('INVALID_RESPONSE');
      const value = await data.read((client) => run(client, input), undefined, !own);
      if (ticket !== epoch.current) throw new ClientFailure('INVALID_RESPONSE');
      return value;
    },
  });
  const reset = useRef(mutation.reset);
  reset.current = mutation.reset;
  useFocusEffect(
    useCallback(() => {
      epoch.current += 1;
      return () => {
        epoch.current += 1;
        reset.current();
      };
    }, []),
  );
  return mutation;
}
