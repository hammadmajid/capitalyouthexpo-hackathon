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
