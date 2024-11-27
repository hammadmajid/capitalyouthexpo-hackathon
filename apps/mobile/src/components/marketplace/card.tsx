import { mobileSurfaces } from '@hsm/ui';
import { Image, Pressable, Text, View } from 'react-native';
import { Heart, MapPin, ShieldCheck, Building2 } from 'lucide-react-native';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { marketplacePrice } from '@hsm/api-client';
import type { z } from 'zod';
import type { listingSummarySchema } from '@hsm/contracts';
type Listing = z.infer<typeof listingSummarySchema>;
export function HostelCard({
  listing,
  imageUrl,
  saved,
  open,
  toggleSaved,
  saving = false,
}: {
  listing: Listing;
  imageUrl: string | null;
  saved: boolean | null;
  saving?: boolean;
  open: () => void;
  toggleSaved: () => void;
}) {
  return (
    <View
      style={{
        ...mobileSurfaces.icyCard,
        borderRadius: metrics.large,
        backgroundColor: mobileSurfaces.icyCard.backgroundColor,
        borderWidth: 1,
        borderColor: mobileSurfaces.icyCard.borderColor,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${listing.name}`}
        onPress={open}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            accessibilityLabel={listing.media[0]?.altText}
            style={{ height: metrics.heroHeight, width: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              height: metrics.heroHeight,
              backgroundColor: colors.sage,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Building2 color={colors.primary} size={metrics.avatarSize} />
          </View>
        )}
        <View style={{ padding: metrics.lg, gap: metrics.sm }}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.heading,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: metrics.xl,
            }}
          >
            {listing.name}
          </Text>
          <ShieldCheck
            color={colors.primary}
            size={metrics.iconSize}
            accessibilityLabel="Verified property"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.xs }}>
            <MapPin color={colors.secondary} size={metrics.iconSize} />
            <Text style={{ color: colors.secondary, flexShrink: 1 }}>
              {[listing.area, listing.city].filter(Boolean).join(', ')}
            </Text>
          </View>
          <Text style={{ color: colors.primary, fontFamily: 'PlusJakartaSans_700Bold' }}>
            {listing.priceFromPaisa === null
              ? 'Pricing unavailable'
              : `From ${marketplacePrice(listing.priceFromPaisa)} / month`}
          </Text>
          <Text style={{ color: colors.secondary }}>
            {listing.amenities.map((item) => item.name).join(' · ')}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          saved === null
            ? `Saved status not loaded for ${listing.name}`
            : `${saved ? 'Unsave' : 'Save'} ${listing.name}`
        }
        disabled={saving || saved === null}
        accessibilityState={{ selected: saved === true, disabled: saving || saved === null }}
        onPress={toggleSaved}
        style={{
          ...mobileSurfaces.icyCard,
          position: 'absolute',
          top: metrics.md,
          right: metrics.md,
          backgroundColor: mobileSurfaces.icyCard.backgroundColor,
          borderRadius: metrics.pill,
          minWidth: metrics.touch,
          minHeight: metrics.touch,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Heart
          color={colors.favorite}
          fill={saved ? colors.favorite : 'transparent'}
          size={metrics.iconSize}
        />
      </Pressable>
    </View>
  );
}
