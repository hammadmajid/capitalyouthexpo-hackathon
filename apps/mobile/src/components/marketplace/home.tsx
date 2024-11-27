import { mobileSurfaces } from '@hsm/ui';
import { PullScrollView } from '../pull-refresh';
import { Skeleton } from '../loading/skeleton';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { z } from 'zod';
import type { listingSummarySchema, institutionPageSchema } from '@hsm/contracts';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { HostelCard } from './card';
import { MarketplaceHero } from './hero';
import { HostelComparison } from './comparison';
type Listing = z.infer<typeof listingSummarySchema>;
type Institution = z.infer<typeof institutionPageSchema>['data'][number];
export function MarketplaceHome({
  showHero = true,
  listings,
  institutions,
  recent,
  savedIds,
  openListing,
  toggleSaved,
  openInstitution,
  imageUrl,
  savedComplete = true,
  saving = false,
  loading,
}: {
  showHero?: boolean;
  listings: Listing[];
  institutions: Institution[];
  recent: Listing[];
  savedIds: Set<string>;
  openListing: (id: string) => void;
  toggleSaved: (id: string, saved: boolean) => void;
  openInstitution: (id: string) => void;
  imageUrl: (listing: Listing) => string | null;
  savedComplete?: boolean;
  saving?: boolean;
  loading?: { listings: boolean; institutions: boolean; recent: boolean };
  relatedError?: string;
  retryRelated?: () => void;
}) {
  const { width } = useWindowDimensions();
  const columns = width >= 1000 ? 3 : width >= 680 ? 2 : 1;
  const contentWidth = Math.min(width, 1240) - metrics.lg * 2;
  const cardWidth = (contentWidth - metrics.lg * (columns - 1)) / columns;
  const card = (listing: Listing) => (
    <View key={listing.branchId} style={{ width: cardWidth }}>
      <HostelCard
        listing={listing}
        imageUrl={imageUrl(listing)}
        saved={savedIds.has(listing.branchId) ? true : savedComplete ? false : null}
        saving={saving}
        open={() => openListing(listing.branchId)}
        toggleSaved={() => toggleSaved(listing.branchId, !savedIds.has(listing.branchId))}
      />
    </View>
  );
  return (
    <PullScrollView
      contentContainerStyle={{
        padding: metrics.lg,
        gap: metrics.lg,
        width: '100%',
        maxWidth: 1240,
        alignSelf: 'center',
        backgroundColor: 'transparent',
      }}
      keyboardShouldPersistTaps="handled"
    >
      {showHero ? <MarketplaceHero /> : null}
      <SectionTitle title="Featured Hostels" />
      {loading?.listings ? (
        <Skeleton kind="listing" label="Loading hostels" />
      ) : listings.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: metrics.lg }}>
          {listings.map(card)}
        </View>
      ) : (
        <Empty text="No matching hostels." />
      )}
      {loading?.institutions || institutions.length ? (
        <SectionTitle title="Hostels within 5 km of campus" />
      ) : null}
      {loading?.institutions ? (
        <Skeleton kind="stats" label="Loading nearby universities" />
      ) : institutions.length ? (
        <ScrollView horizontal contentContainerStyle={{ gap: metrics.md }}>
          {institutions.map((institution) => (
            <Pressable
              key={institution.id}
              accessibilityRole="button"
              accessibilityLabel={`${institution.name}, ${institution.hostelCount} hostels nearby`}
              onPress={() => openInstitution(institution.id)}
              style={{
                ...mobileSurfaces.icyCard,
                minHeight: metrics.touch,
                borderRadius: metrics.card,
                backgroundColor: mobileSurfaces.icyCard.backgroundColor,
                padding: metrics.lg,
                borderWidth: 1,
                borderColor: mobileSurfaces.icyCard.borderColor,
              }}
            >
              <Text style={{ color: colors.heading, fontFamily: 'PlusJakartaSans_700Bold' }}>
                {institution.shortName ?? institution.name}
              </Text>
              <Text style={{ color: colors.secondary }}>{institution.hostelCount} hostels</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {institutions.length ? (
        // CHG-032: ODbL attribution for institutions loaded from OpenStreetMap.
        <Text style={{ color: colors.secondary, fontSize: 11 }}>© OpenStreetMap contributors</Text>
      ) : null}
      <HostelComparison listings={listings} institutions={institutions} openListing={openListing} />
      {loading?.recent || recent.length ? <SectionTitle title="Recently viewed" /> : null}
      {loading?.recent ? (
        <Skeleton kind="listing" label="Loading recent hostels" />
      ) : recent.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: metrics.lg }}>
          {recent.map(card)}
        </View>
      ) : null}
    </PullScrollView>
  );
}
function SectionTitle({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.md }}>
      <Text
        accessibilityRole="header"
        style={{
          flex: 1,
          color: colors.heading,
          fontFamily: 'PlusJakartaSans_700Bold',
          fontSize: metrics.xxl,
        }}
      >
        {title}
      </Text>
    </View>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <Text style={{ color: colors.secondary, fontFamily: 'PlusJakartaSans_400Regular' }}>
      {text}
    </Text>
  );
}
