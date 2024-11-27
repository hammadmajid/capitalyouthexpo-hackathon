import { mobileSurfaces } from '@hsm/ui';
import { useState, useCallback, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { ArrowLeft, Search, X, ArrowRight } from 'lucide-react-native';
import { mobileColors as colors, icons, radii, spacing } from '@hsm/ui';

export type HeaderSearchConfig = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  maxLength?: number;
  disabled?: boolean;
  alwaysVisible?: boolean;
};
export function AppHeader({
  title,
  search,
  backTo = '/admin',
  backDisabled = false,
  backLabel = 'Back',
  showBack = true,
  onBack,
  actions,
}: {
  title: string;
  search?: HeaderSearchConfig;
  backTo?: Href;
  backDisabled?: boolean;
  backLabel?: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  const [searching, setSearching] = useState(false);
  return (
    <View style={s.container}>
      {showBack && onBack ? <InlineBackHandler onBack={onBack} disabled={backDisabled} /> : null}
      <View style={s.row}>
        {showBack ? (
          <NavIconButton
            label={backLabel}
            disabled={backDisabled}
            onPress={
              onBack ?? (() => (router.canGoBack?.() ? router.back() : router.replace(backTo)))
            }
          />
        ) : null}
        <Text
          accessibilityRole="header"
          className="font-heading text-xl text-heading"
          style={s.title}
        >
          {title}
        </Text>
        {actions}
        {search && !search.alwaysVisible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Search ' + title}
            accessibilityState={{ expanded: searching }}
            android_ripple={{ color: colors.aqua }}
            onPress={() => setSearching(!searching)}
            style={s.icon}
          >
            {searching ? (
              <X size={icons.size} color={colors.primary} />
            ) : (
              <Search size={icons.size} color={colors.primary} />
            )}
          </Pressable>
        ) : null}
      </View>
      {search && (searching || search.alwaysVisible) ? (
        <View style={s.search}>
          <TextInput
            accessibilityLabel={search.label}
            placeholder={search.label}
            placeholderTextColor={colors.secondary}
            editable={!search.disabled}
            value={search.value}
            onChangeText={search.onChange}
            maxLength={search.maxLength ?? 120}
            returnKeyType="search"
            onSubmitEditing={search.onSubmit}
            autoCapitalize="none"
            autoFocus={!search.alwaysVisible}
            style={s.input}
          />
          <Pressable
            accessibilityRole="button"
            disabled={search.disabled}
            accessibilityState={{ disabled: Boolean(search.disabled) }}
            accessibilityLabel={search.submitLabel}
            onPress={search.onSubmit}
            style={s.icon}
            android_ripple={{ color: colors.aqua }}
          >
            <ArrowRight size={icons.size} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
function InlineBackHandler({ onBack, disabled }: { onBack: () => void; disabled: boolean }) {
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!disabled) onBack();
        return true;
      });
      return () => subscription.remove();
    }, [onBack, disabled]),
  );
  return null;
}
export function NavIconButton({
  label = 'Back',
  onPress,
  disabled = false,
  children,
}: {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.aqua }}
      style={s.icon}
    >
      {children ?? <ArrowLeft color={disabled ? colors.muted : colors.primary} size={icons.size} />}
    </Pressable>
  );
}
const s = StyleSheet.create({
  container: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1, flexShrink: 1 },
  icon: {
    ...mobileSurfaces.icyCard,
    width: spacing.touch,
    height: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    overflow: 'hidden',
  },
  search: {
    ...mobileSurfaces.icyCard,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    padding: spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: spacing.touch,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
});
