import { Text, View } from 'react-native';
import { marketplacePrice, type listPublicInventoryRoomTypes } from '@hsm/api-client';
import {
  mobileColors,
  mobileMarketplaceColors as colors,
  marketplaceMetrics as metrics,
} from '@hsm/ui';
import { MarketplaceAction } from './action';
import { roomTypeTitle } from '../../lib/room-type-title';
type Type = Awaited<ReturnType<typeof listPublicInventoryRoomTypes>>['data'][number];
export function PublicInventoryTypes({
  rows,
  disabled,
  choose,
}: {
  rows: Type[];
  disabled: boolean;
  choose: (id: string) => void;
}) {
  return (
    <View style={{ gap: metrics.lg }}>
      {rows.map((type) => (
        <View
          key={type.id}
          style={{
            gap: metrics.sm,
            borderRadius: metrics.card,
            padding: metrics.lg,
            borderWidth: 1,
            borderColor: mobileColors.cardBorder,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: colors.heading, fontFamily: 'PlusJakartaSans_700Bold' }}
          >
            {roomTypeTitle(type)}
          </Text>
          <Text style={{ color: colors.secondary }}>Up to {type.capacity} beds per room</Text>
          {type.amenities.length ? (
            <View
              accessibilityLabel={'Amenities for ' + type.name}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: metrics.sm }}
            >
              {type.amenities.map((amenity) => (
                <Text
                  key={amenity.code}
                  style={{
                    color: colors.primary,
                    backgroundColor: colors.sage,
                    padding: metrics.sm,
                    borderRadius: metrics.card,
                  }}
                >
                  {amenity.name}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.secondary }}>No published room amenities.</Text>
          )}
          {type.inventoryMode !== 'whole_room' && type.bedMonthlyRentPaisa !== null ? (
            <Text style={{ color: colors.primary }}>
              Beds from: {marketplacePrice(type.bedMonthlyRentPaisa)} / month
            </Text>
          ) : null}
          {type.inventoryMode !== 'per_bed' && type.roomMonthlyRentPaisa !== null ? (
            <Text style={{ color: colors.primary }}>
              Whole room: {marketplacePrice(type.roomMonthlyRentPaisa)} / month
            </Text>
          ) : null}
          <Text style={{ color: colors.secondary }}>
            {type.inventoryMode === 'both'
              ? 'Whole-room security'
              : type.inventoryMode === 'per_bed'
                ? 'Security from'
                : 'Security'}
            : {marketplacePrice(type.depositPaisa)}
          </Text>
          <MarketplaceAction
            secondary
            label={'View rooms for ' + type.name}
            disabled={disabled}
            onPress={() => choose(type.id)}
          />
        </View>
      ))}
    </View>
  );
}
