import { useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  listMarketplace,
  marketplaceInstitutions,
  listSavedHostels,
  saveHostel,
} from '@hsm/api-client';
import type { MarketplaceQuery } from '@hsm/contracts';
import { client, actorClient } from '../../lib/runtime';
export function useMarketplace({
  actorId,
  customer,
  query,
  recentIds,
}: {
  actorId: string | null;
  customer: boolean;
  query: Partial<MarketplaceQuery>;
  recentIds: string[];
}) {
  const cache = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const listingPages = useInfiniteQuery({
    queryKey: ['marketplace', query],
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listMarketplace(client, { ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const institutions = useQuery({
    queryKey: ['marketplace-institutions'],
    queryFn: () => marketplaceInstitutions(client, { limit: 20, radiusMeters: 5000 }),
  });
  const recent = useQuery({
    queryKey: ['marketplace-recent', recentIds],
    enabled: recentIds.length > 0,
    queryFn: () => listMarketplace(client, { ids: recentIds.slice(0, 20) }),
  });
  const savedPages = useInfiniteQuery({
    queryKey: ['marketplace-saved', actorId],
    enabled: customer && actorId !== null,
    gcTime: 0,
    initialPageParam: null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) =>
      listSavedHostels(await actorClient(actorId ?? ''), {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const save = useMutation({
    gcTime: 0,
    mutationFn: async (input: { branchId: string; saved: boolean }) => {
      const command = JSON.stringify([actorId, input.branchId, input.saved]);
      let key = keys.current.get(command);
      if (!key) {
        key = randomUUID();
        keys.current.set(command, key);
      }
      return saveHostel(await actorClient(actorId ?? ''), input.branchId, input.saved, key);
    },
    onSuccess: async (_response, input) => {
      keys.current.delete(JSON.stringify([actorId, input.branchId, input.saved]));
      await cache.invalidateQueries({ queryKey: ['marketplace-saved', actorId], exact: true });
    },
  });
  const listings = {
    ...listingPages,
    data: listingPages.data
      ? {
          data: listingPages.data.pages.flatMap((page) => page.data),
          nextCursor: listingPages.data.pages.at(-1)?.nextCursor ?? null,
        }
      : undefined,
  };
  const saved = {
    ...savedPages,
    data: savedPages.data
      ? {
          data: savedPages.data.pages.flatMap((page) => page.data),
          nextCursor: savedPages.data.pages.at(-1)?.nextCursor ?? null,
        }
      : undefined,
  };
  return { listings, institutions, recent, saved, save };
}
