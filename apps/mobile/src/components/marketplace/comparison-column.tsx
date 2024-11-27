import { mobileSurfaces } from '@hsm/ui';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  listPublicInventoryRoomTypes,
  marketplacePrice,
  type HostelComparison,
  type ComparisonInput,
} from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { client } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { MarketplaceAction } from './action';
export function ComparisonColumn({
  item,
  range,
  openListing,
}: {
  item: HostelComparison[number];
  range: ComparisonInput['range'];
  openListing: (id: string) => void;
}) {
  const { listing } = item,
    [cursor, setCursor] = useState<string>();
  const types = useQuery({
    queryKey: ['comparison-types', listing.branchId, range, cursor],
    initialData: cursor ? undefined : item.roomTypes,
    retry: false,
    queryFn: () =>
      listPublicInventoryRoomTypes(client, listing.branchId, {
        limit: 20,
        ...range,
        ...(cursor ? { cursor } : {}),
      }),
  });
  const text = { color: colors.heading };
  if (types.isError)
    return (
      <View style={{ width: 280, padding: metrics.lg }}>
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {safeMessage(types.error)}
        </Text>
      </View>
    );
  return (
    <View
      style={{
        ...mobileSurfaces.icyCard,
        width: 280,
        gap: metrics.md,
        padding: metrics.lg,
        backgroundColor: mobileSurfaces.icyCard.backgroundColor,
        borderWidth: 1,
        borderColor: mobileSurfaces.icyCard.borderColor,
        borderRadius: metrics.card,
      }}
    >
      <Text accessibilityRole="header" style={{ ...text, fontSize: metrics.xl }}>
        {listing.name}
      </Text>
      <Text style={text}>Verified · {listing.category.replaceAll('_', ' ')}</Text>
      <Text style={text}>{[listing.area, listing.city].filter(Boolean).join(', ')}</Text>
      <Text style={text}>
        Monthly rent from:{' '}
        {listing.priceFromPaisa === null ? 'Unavailable' : marketplacePrice(listing.priceFromPaisa)}
      </Text>
      <Text style={text}>
        Available beds:{' '}
        {listing.availableBeds === null ? 'Choose stay dates' : listing.availableBeds}
      </Text>
      <Text style={text}>
        Available whole rooms:{' '}
        {listing.availableWholeRooms === null ? 'Choose stay dates' : listing.availableWholeRooms}
      </Text>
      <Text style={text}>
        Distance:{' '}
        {listing.distanceMeters === null
          ? 'No destination selected'
          : Math.round(listing.distanceMeters) + ' m'}
      </Text>
      <Text style={text}>
        Amenities: {listing.amenities.map((amenity) => amenity.name).join(', ') || 'Not published'}
      </Text>
      <Text style={text}>
        Mess/menu: not available. Transport: not available. Verified reviews/rating: not available.
      </Text>
      <Text accessibilityRole="header" style={text}>
        Room types and deposits
      </Text>
      {types.isFetching ? (
        <Text style={text}>Refreshing room prices…</Text>
      ) : (
        types.data?.data.map((type) => (
          <View key={type.id} style={{ gap: metrics.sm }}>
            <Text style={text}>
              {type.name} · Capacity {type.capacity}
            </Text>
            <Text style={text}>
              Bed/month:{' '}
              {type.bedMonthlyRentPaisa === null
                ? 'Not offered'
                : marketplacePrice(type.bedMonthlyRentPaisa)}
            </Text>
            <Text style={text}>
              Room/month:{' '}
              {type.roomMonthlyRentPaisa === null
                ? 'Not offered'
                : marketplacePrice(type.roomMonthlyRentPaisa)}
            </Text>
            <Text style={text}>Deposit: {marketplacePrice(type.depositPaisa)}</Text>
            <Text style={text}>{type.amenities.map((amenity) => amenity.name).join(', ')}</Text>
          </View>
        ))
      )}
      {!types.isFetching && !types.isError && types.data?.data.length === 0 ? (
        <Text style={text}>No published room types on this page.</Text>
      ) : null}
      {types.data?.nextCursor && !types.isError ? (
        <MarketplaceAction
          disabled={types.isFetching}
          secondary
          onPress={() => setCursor(types.data?.nextCursor ?? undefined)}
          label={'Next room types for ' + listing.name}
        />
      ) : null}
      {cursor ? (
        <MarketplaceAction
          disabled={types.isFetching}
          secondary
          onPress={() => setCursor(undefined)}
          label={'First room types for ' + listing.name}
        />
      ) : null}
      <MarketplaceAction
        secondary
        label={'View ' + listing.name}
        onPress={() => openListing(listing.branchId)}
      />
    </View>
  );
}
