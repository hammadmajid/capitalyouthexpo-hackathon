import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { branchMapCenter, branchMapStyle } from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import type { z } from 'zod';
import type { listingSummarySchema } from '@hsm/contracts';
type Listing = z.infer<typeof listingSummarySchema>;
export function MarketplaceMap({
  listings,
  openListing,
}: {
  listings: Listing[];
  openListing: (id: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ flex: 1, gap: metrics.sm }}>
      <Map
        style={{ flex: 1, minHeight: metrics.heroHeight }}
        mapStyle={branchMapStyle}
        onDidFailLoadingMap={() => setFailed(true)}
      >
        <Camera initialViewState={{ center: branchMapCenter, zoom: 11 }} />
        {listings.map((listing) => (
          <Marker key={listing.branchId} lngLat={[listing.longitude, listing.latitude]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${listing.name} on map`}
              onPress={() => openListing(listing.branchId)}
              style={{
                minHeight: metrics.touch,
                minWidth: metrics.touch,
                borderRadius: metrics.pill,
                backgroundColor: colors.primary,
                padding: metrics.sm,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.surface, fontFamily: 'PlusJakartaSans_700Bold' }}>
                {listing.name}
              </Text>
            </Pressable>
          </Marker>
        ))}
      </Map>
      {failed ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          Map unavailable. Hostel listings remain available from Home.
        </Text>
      ) : null}
      {!listings.length ? (
        <Text style={{ color: colors.secondary }}>No approved hostels in these results.</Text>
      ) : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Map attribution"
        onPress={() => {
          void Linking.openURL('https://openfreemap.org/').catch(() => setFailed(true));
        }}
        style={{ minHeight: metrics.touch, padding: metrics.sm }}
      >
        <Text style={{ color: colors.primary }}>
          OpenFreeMap · OpenMapTiles · © OpenStreetMap contributors
        </Text>
      </Pressable>
    </View>
  );
}
