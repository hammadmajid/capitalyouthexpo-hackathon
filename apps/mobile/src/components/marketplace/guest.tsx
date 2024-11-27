import { NatureBackground } from '../visual-surfaces';
import { Skeleton } from '../loading/skeleton';
import { useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { MarketplaceQuery } from '@hsm/contracts';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { config } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { MarketplaceHeader } from './header';
import { MarketplaceHome } from './home';
import { MarketplaceNavigation, type MarketplaceTab } from './navigation';
import { MarketplaceMap } from './map';
import { MarketplaceDetails } from './details';
import { MarketplaceFilters, applyFilters } from './filters';
import { MarketplaceAction } from './action';
import { useMarketplace } from './use-marketplace';
import { PlaceSuggestions, usePlaceSearch } from './place-suggestions';
import { NearbyActions } from './nearby-actions';
export function GuestMarketplace() {
  const [tab, setTab] = useState<MarketplaceTab>('Home');
  const [query, setQuery] = useState<Partial<MarketplaceQuery>>({ limit: 20 });
  const places = usePlaceSearch(setQuery);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>();
  const [filters, setFilters] = useState(false);
  const source = useMarketplace({ actorId: null, customer: false, query, recentIds });
  const signIn = () => router.push('/auth/login');
  const failure = source.listings.error;
  const pending = source.listings.isPending;
  function openListing(id: string) {
    setRecentIds((current) => [id, ...current.filter((value) => value !== id)].slice(0, 20));
    setSelected(id);
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <NatureBackground />
      <MarketplaceHeader
        name={null}
        unreadCount={0}
        openProfile={signIn}
        openNotifications={signIn}
        {...(tab === 'Home'
          ? {
              search: {
                label: 'Search hostels, university or area',
                value: places.search,
                onChange: places.onChange,
                onSubmit: places.onSubmit,
                submitLabel: 'Search hostels',
                maxLength: 120,
              },
              filters: () => setFilters(true),
            }
          : {})}
      />
      {tab === 'Home' ? (
        <View style={{ gap: metrics.sm }}>
          <PlaceSuggestions places={places.places} pick={places.pick} />
          <NearbyActions choose={places.point} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {pending && tab === 'Map' ? (
          <Skeleton kind="listing" label="Loading hostels" />
        ) : failure ? (
          <View style={{ padding: metrics.lg, gap: metrics.md }}>
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              {safeMessage(failure)}
            </Text>
            <MarketplaceAction
              label="Try again"
              onPress={() => {
                void source.listings.refetch();
                void source.institutions.refetch();
                if (recentIds.length) void source.recent.refetch();
              }}
            />
          </View>
        ) : tab === 'Map' ? (
          <MarketplaceMap listings={source.listings.data?.data ?? []} openListing={openListing} />
        ) : (
          <MarketplaceHome
            loading={{
              listings: source.listings.isPending,
              institutions: source.institutions.isPending,
              recent: recentIds.length > 0 && source.recent.isPending,
            }}
            {...(source.institutions.error || source.recent.error
              ? {
                  relatedError: safeMessage(source.institutions.error ?? source.recent.error),
                  retryRelated: () => {
                    void source.institutions.refetch();
                    if (recentIds.length) void source.recent.refetch();
                  },
                }
              : {})}
            listings={source.listings.data?.data ?? []}
            institutions={source.institutions.data?.data ?? []}
            recent={source.recent.data?.data ?? []}
            savedIds={new Set()}

            openListing={openListing}
            toggleSaved={signIn}
            openInstitution={(id) => {
              places.clear();
              setQuery({ universityPlaceId: id, radiusMeters: 5000, sort: 'nearest', limit: 20 });
            }}
            imageUrl={(listing) =>
              listing.media[0]
                ? `${config.apiUrl}/v1/marketplace/media/${listing.media[0].id}`
                : null
            }
          />
        )}
      </View>
      {source.listings.hasNextPage ? (
        <MarketplaceAction
          label={source.listings.isFetchingNextPage ? 'Loading hostels...' : 'Load more hostels'}
          disabled={source.listings.isFetchingNextPage}
          onPress={() => {
            void source.listings.fetchNextPage();
          }}
        />
      ) : null}
      <MarketplaceNavigation
        selected={tab}
        select={(next) => {
          if (next === 'Home' || next === 'Map') setTab(next);
          else signIn();
        }}
      />
      {selected ? (
        <MarketplaceDetails
          branchId={selected}
          close={() => setSelected(undefined)}
          // The details sheet is a Modal; close it first or the sign-in opens underneath it.
          signIn={() => {
            setSelected(undefined);
            signIn();
          }}
        />
      ) : null}
      {filters ? (
        <MarketplaceFilters
          query={query}
          close={() => setFilters(false)}
          apply={(value) => setQuery((current) => applyFilters(current, value))}
        />
      ) : null}
    </SafeAreaView>
  );
}
