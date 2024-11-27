import { Skeleton } from '../loading/skeleton';
import { Text, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listPublicListingRules } from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { client } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { MarketplaceAction } from './action';
export function PublicListingRules({ branchId }: { branchId: string }) {
  const query = useInfiniteQuery({
    queryKey: ['public-listing-rules', branchId],
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listPublicListingRules(client, branchId, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 0,
  });
  const rules = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.data).map((rule) => [rule.id, rule]),
    ).values(),
  ];
  return (
    <View style={{ gap: metrics.md }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.heading, fontFamily: 'PlusJakartaSans_700Bold' }}
      >
        Hostel rules
      </Text>
      {query.isPending ? <Skeleton kind="listing" label="Loading hostel rules…" /> : null}
      {query.isError ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {safeMessage(query.error)}
        </Text>
      ) : (
        <>
          {query.isSuccess && !rules.length ? (
            <Text style={{ color: colors.secondary }}>
              No published hostel rules are available.
            </Text>
          ) : null}
          {rules.map((rule) => (
            <Text key={rule.id} style={{ color: colors.heading }}>
              {rule.body}
            </Text>
          ))}
        </>
      )}
      {query.hasNextPage && !query.isError ? (
        <MarketplaceAction
          secondary
          label="Load more hostel rules"
          disabled={query.isFetching}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
