import { Skeleton } from '../loading/skeleton';
import { useState } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { publicGallery } from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { client, config } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { MarketplaceAction } from './action';
function Photo({ id, altText, width }: { id: string; altText: string; width: number }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <View
      style={{
        width,
        height: metrics.heroHeight,
        borderRadius: metrics.card,
        backgroundColor: colors.sage,
        padding: metrics.md,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.secondary }}>Photo unavailable: {altText}</Text>
    </View>
  ) : (
    <Image
      source={{ uri: config.apiUrl + '/v1/marketplace/media/' + id }}
      accessibilityLabel={altText}
      resizeMode="cover"
      onError={() => setFailed(true)}
      style={{ width, height: metrics.heroHeight, borderRadius: metrics.card }}
    />
  );
}
export function PublicGallery({ branchId }: { branchId: string }) {
  const { width } = useWindowDimensions();
  const photoWidth = Math.max(180, Math.min(520, width - metrics.xxl * 2 - metrics.md));
  const query = useInfiniteQuery({
    queryKey: ['public-gallery', branchId],
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      publicGallery(client, branchId, { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 0,
  });
  const photos = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.data).map((photo) => [photo.id, photo]),
    ).values(),
  ];
  return (
    <View style={{ gap: metrics.md }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.heading, fontFamily: 'PlusJakartaSans_700Bold' }}
      >
        Hostel photos
      </Text>
      {query.isPending ? <Skeleton kind="listing" label="Loading hostel photos…" /> : null}
      {query.isError ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {safeMessage(query.error)}
        </Text>
      ) : (
        <>
          {query.isSuccess && !photos.length ? (
            <Text style={{ color: colors.secondary }}>
              No published hostel photos are available.
            </Text>
          ) : null}
          {photos.length ? (
            <ScrollView horizontal contentContainerStyle={{ gap: metrics.md }}>
              {photos.map((photo) => (
                <Photo key={photo.id} {...photo} width={photoWidth} />
              ))}
            </ScrollView>
          ) : null}
        </>
      )}
      {query.hasNextPage && !query.isError ? (
        <MarketplaceAction
          secondary
          disabled={query.isFetching}
          label="Load more hostel photos"
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
