import { type LucideIcon } from 'lucide-react-native';
import { mobileColors as colors, icons } from '@hsm/ui';
import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { mobileSurfaces } from '@hsm/ui';
export function Copy({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <Text
      accessibilityRole={alert ? 'alert' : undefined}
      className={alert ? 'font-body text-body text-dangerText' : 'font-body text-body text-text'}
    >
      {children}
    </Text>
  );
}
export function Button({
  label,
  onPress,
  disabled = false,
  secondary = false,
  Icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  Icon?: LucideIcon;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={secondary ? mobileSurfaces.input : mobileSurfaces.emeraldGlass}
      className={
        'min-h-12 rounded-input px-5 py-3 flex-row gap-2 items-center justify-center ' +
        (secondary ? 'bg-icy border border-border ' : 'bg-primary ') +
        (disabled ? 'opacity-50' : '')
      }
    >
      {Icon ? (
        <Icon
          size={icons.size}
          color={secondary ? colors.primary : colors.surface}
          accessible={false}
        />
      ) : null}
      <Text className={'font-heading text-body ' + (secondary ? 'text-primary' : 'text-surface')}>
        {label}
      </Text>
    </Pressable>
  );
}
