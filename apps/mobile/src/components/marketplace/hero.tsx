import { mobileSurfaces } from '@hsm/ui';
import { useState } from 'react';
import { ImageBackground, Text, View, type ViewStyle } from 'react-native';
import { ShieldCheck, BedDouble, UsersRound } from 'lucide-react-native';
import { marketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import heroImage from '../../assets/marketplace-hero.png';
const benefits = [
  { Icon: ShieldCheck, label: 'Verified properties' },
  { Icon: BedDouble, label: 'Student friendly' },
  { Icon: UsersRound, label: 'Twin Cities locations' },
];
export function MarketplaceHero() {
  const [failed, setFailed] = useState(false);
  const style: ViewStyle = {
    ...mobileSurfaces.solidCard,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    minHeight: metrics.heroHeight,
    backgroundColor: colors.hero,
    padding: metrics.xxl,
    borderRadius: metrics.large,
    overflow: 'hidden',
    justifyContent: 'center',
    gap: metrics.lg,
  };
  const content = (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: colors.heroScrim,
        }}
      />
      <Text
        accessibilityRole="header"
        style={{
          color: colors.heroText,
          fontFamily: 'PlusJakartaSans_700Bold',
          fontSize: metrics.heroTitleSize,
        }}
      >
        Find Your{'\n'}Perfect Hostel
      </Text>
      <Text
        style={{
          color: colors.sage,
          fontFamily: 'PlusJakartaSans_400Regular',
          fontSize: metrics.bodySize,
        }}
      >
        Safe. Comfortable. Near Your University.
      </Text>
      <View style={{ flexDirection: 'row', gap: metrics.md }}>
        {benefits.map(({ Icon, label }) => (
          <View
            key={label}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: metrics.sm }}
          >
            <Icon color={colors.sage} size={metrics.iconSize} strokeWidth={metrics.iconStroke} />
            <Text
              style={{
                flexShrink: 1,
                color: colors.heroText,
                fontFamily: 'PlusJakartaSans_400Regular',
                fontSize: metrics.bodySize,
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={{ color: colors.heroText, fontFamily: 'PlusJakartaSans_400Regular' }}>
        {failed ? 'Illustration unavailable.' : 'Illustrative image'}
      </Text>
    </>
  );
  return failed ? (
    <View style={style}>{content}</View>
  ) : (
    <ImageBackground
      testID="Home hero artwork"
      source={heroImage}
      resizeMode="cover"
      onError={() => setFailed(true)}
      style={style}
      imageStyle={{ borderRadius: metrics.large }}
    >
      {content}
    </ImageBackground>
  );
}
