import { NatureBackground } from '../visual-surfaces';
import { PullScrollView } from '../pull-refresh';
import { AppHeader } from '../navigation/header';
import { Skeleton } from '../loading/skeleton';
import { StayDirectory } from '../stay-directory';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { MarketplaceQuery, listingSummarySchema } from '@hsm/contracts';
import type { z } from 'zod';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { config } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { useInbox } from '../use-inbox';
import { Inbox } from '../inbox';
import { CustomerBookings } from '../customer-bookings';
import { CustomerAccount } from './customer-account';
import { PlaceSuggestions, usePlaceSearch } from './place-suggestions';
import { NearbyActions } from './nearby-actions';
import { useMarketplace } from './use-marketplace';
import { MarketplaceHeader } from './header';
import { MarketplaceHome } from './home';
import { MarketplaceNavigation, type MarketplaceTab } from './navigation';
import { MarketplaceMap } from './map';
import { MarketplaceDetails } from './details';
import { MarketplaceFilters, applyFilters } from './filters';
import { MarketplaceAction } from './action';
import { HostelCard } from './card';
export function CustomerMarketplace(props: { actorId: string; name: string | null }) {
  return <CustomerDiscovery key={props.actorId} {...props} />;
}
function CustomerDiscovery({ actorId, name }: { actorId: string; name: string | null }) {
  const [tab, setTab] = useState<MarketplaceTab>('Home');
  const previousTab = useRef<MarketplaceTab>('Home');
  const backFromAccount = useCallback(() => setTab(previousTab.current), []);
  function selectTab(next: MarketplaceTab) {
    if (next === 'Profile' && tab !== 'Profile') previousTab.current = tab;
    setNotifications(false);
    setTab(next);
  }
  const [query, setQuery] = useState<Partial<MarketplaceQuery>>({ limit: 20 });
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const places = usePlaceSearch(setQuery);
  const [selected, setSelected] = useState<string>(),
    [filters, setFilters] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const source = useMarketplace({ actorId, customer: true, query, recentIds });
  const inbox = useInbox(actorId);
  const savedIds = new Set(source.saved.data?.data.map((item) => item.branchId));
  const active = tab === 'Saved' ? source.saved : source.listings;
  const screenTitle = tab === 'Home' ? 'Find hostels' : tab === 'Saved' ? 'Saved hostels' : tab;
  const publicTab = tab === 'Home' || tab === 'Map' || tab === 'Saved';
  const imageUrl = (listing: z.infer<typeof listingSummarySchema>) =>
    listing.media[0] ? `${config.apiUrl}/v1/marketplace/media/${listing.media[0].id}` : null;
  function openListing(id: string) {
    setRecentIds((current) => [id, ...current.filter((value) => value !== id)].slice(0, 20));
    setSelected(id);
  }
  function toggleSaved(branchId: string, saved: boolean) {
    if (!source.save.isPending) source.save.mutate({ branchId, saved });
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <NatureBackground mint={tab === 'Profile'} />
      {!notifications && tab !== 'Profile' ? (
        <MarketplaceHeader
          title={screenTitle}
          name={name}
          unreadCount={inbox.query.data?.pages[0]?.unreadCount ?? 0}
          openProfile={() => selectTab('Profile')}
          openNotifications={() => setNotifications((current) => !current)}
          {...(tab === 'Home' && !notifications
            ? {
                search: {
                  label: 'Search hostels, university or area',
                  value: places.search,
                  onChange: places.onChange,
                  onSubmit: places.onSubmit,
                  alwaysVisible: true,
                  submitLabel: 'Search hostels',
                  maxLength: 120,
                },
                filters: () => setFilters(true),
              }
            : {})}
        />
      ) : null}
      {tab === 'Home' && !notifications ? (
        <View style={{ gap: metrics.sm }}>
          <PlaceSuggestions places={places.places} pick={places.pick} />
          <NearbyActions choose={places.point} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {notifications ? (
          <PullScrollView contentContainerStyle={{ padding: metrics.lg }}>
            <AppHeader title="Notifications" onBack={() => setNotifications(false)} />
            <Inbox actorId={actorId} hideHeading />
          </PullScrollView>
        ) : tab === 'Profile' ? (
          <CustomerAccount
            actorId={actorId}
            unreadCount={inbox.query.data?.pages[0]?.unreadCount}
            saved={() => setTab('Saved')}
            back={backFromAccount}
          />
        ) : tab === 'Bookings' ? (
          <PullScrollView
            contentContainerStyle={{
              padding: metrics.lg,
              gap: metrics.lg,
              width: '100%',
              maxWidth: 960,
              alignSelf: 'center',
            }}
          >
            <>
              <CustomerBookings actorId={actorId} hideHeading />
              <StayDirectory actorId={actorId} />
            </>
          </PullScrollView>
        ) : publicTab && tab !== 'Home' && active.isPending ? (
          <Skeleton kind="listing" label="Loading hostels" />
        ) : publicTab && active.isError ? (
          <View style={{ padding: metrics.lg, gap: metrics.md }}>
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              {safeMessage(active.error)}
            </Text>
            <MarketplaceAction
              label="Try again"
              onPress={() => {
                void active.refetch();
                if (tab === 'Home') {
                  void source.institutions.refetch();
                  if (recentIds.length) void source.recent.refetch();
                }
              }}
            />
          </View>
        ) : tab === 'Map' ? (
          <MarketplaceMap listings={source.listings.data?.data ?? []} openListing={openListing} />
        ) : tab === 'Saved' ? (
          <PullScrollView
            contentContainerStyle={{
              padding: metrics.lg,
              gap: metrics.lg,
              width: '100%',
              maxWidth: 840,
              alignSelf: 'center',
            }}
          >
            {source.save.isError ? (
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                {safeMessage(source.save.error)}
              </Text>
            ) : null}
            {source.saved.data?.data.length === 0 ? (
              <Text style={{ color: colors.secondary }}>You have no saved hostels.</Text>
            ) : null}
            {source.saved.data?.data.map((listing) => (
              <HostelCard
                key={listing.branchId}
                listing={listing}
                imageUrl={imageUrl(listing)}
                saved
                saving={source.save.isPending}
                open={() => openListing(listing.branchId)}
                toggleSaved={() => toggleSaved(listing.branchId, false)}
              />
            ))}
            {source.saved.hasNextPage ? (
              <MarketplaceAction
                label={
                  source.saved.isFetchingNextPage
                    ? 'Loading saved hostels...'
                    : 'Load more saved hostels'
                }
                disabled={source.saved.isFetchingNextPage}
                onPress={() => {
                  void source.saved.fetchNextPage();
                }}
              />
            ) : null}
          </PullScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {source.save.isError || source.saved.isError ? (
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                {safeMessage(source.save.error ?? source.saved.error)}
              </Text>
            ) : null}
            <MarketplaceHome
              showHero={false}
              loading={{
                listings: active.isPending,
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
              savedIds={savedIds}
              savedComplete={source.saved.isSuccess && !source.saved.hasNextPage}
              saving={source.save.isPending}

              openListing={openListing}
              toggleSaved={toggleSaved}
              openInstitution={(id) => {
                places.clear();
                setQuery({ universityPlaceId: id, radiusMeters: 5000, sort: 'nearest', limit: 20 });
              }}
              imageUrl={imageUrl}
            />
          </View>
        )}
        {!notifications && (tab === 'Home' || tab === 'Map') && source.listings.hasNextPage ? (
          <MarketplaceAction
            label={source.listings.isFetchingNextPage ? 'Loading hostels...' : 'Load more hostels'}
            disabled={source.listings.isFetchingNextPage}
            onPress={() => {
              void source.listings.fetchNextPage();
            }}
          />
        ) : null}
      </View>
      <MarketplaceNavigation selected={tab} select={selectTab} />
      {selected ? (
        <MarketplaceDetails
          branchId={selected}
          close={() => setSelected(undefined)}
          signedIn
          actorId={actorId}
          signIn={() => {
            setSelected(undefined);
            router.push('/customer-profile');
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
