import { Pressable, Text } from 'react-native';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
export function MarketplaceAction({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: metrics.touch,
        borderRadius: metrics.pill,
        backgroundColor: disabled ? colors.disabled : secondary ? colors.surface : colors.primary,
        borderWidth: 1,
        borderColor: colors.border,
        padding: metrics.md,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: secondary ? colors.primary : colors.surface,
          fontFamily: 'PlusJakartaSans_700Bold',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
