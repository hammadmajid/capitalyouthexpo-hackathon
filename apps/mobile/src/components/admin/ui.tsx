import { mobileSurfaces } from '@hsm/ui';
import type { Href } from 'expo-router';
import { AdminHeader, type AdminSearchConfig } from './navigation-header';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { mobileColors as colors, radii, spacing } from '@hsm/ui';
import { DashboardPage } from './dashboard-ui';
import { premiumShadow } from './premium-surface';
import { Copy } from '../ui';
import { safeMessage } from '../../lib/messages';
export const roleLabels = {
  verification: 'Verification',
  support: 'Support',
  content_moderator: 'Content Moderator',
};
export type AdminRole = keyof typeof roleLabels;
export function AdminPage({
  title,
  children,
  search,
  backTo,
  backDisabled,
  onBack,
}: {
  title: string;
  children: ReactNode;
  search?: AdminSearchConfig;
  backTo?: Href;
  backDisabled?: boolean;
  onBack?: () => void;
}) {
  return (
    <DashboardPage showBrand={false}>
      <AdminHeader
        title={title}
        {...(onBack ? { onBack } : {})}
        {...(search ? { search } : {})}
        {...(backTo ? { backTo } : {})}
        {...(backDisabled !== undefined ? { backDisabled } : {})}
      />
      {children}
    </DashboardPage>
  );
}
export function AdminCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function AdminHeading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" className="font-heading text-subtitle text-heading">
      {children}
    </Text>
  );
}
export function AdminField({
  label,
  value,
  onChange,
  email = false,
  disabled = false,
  multiline = false,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  email?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text className="font-heading text-sm text-secondary">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoCapitalize={email ? 'none' : 'sentences'}
        keyboardType={email ? 'email-address' : 'default'}
        maxLength={maxLength ?? (email ? 254 : 500)}
        multiline={multiline}
        style={styles.input}
      />
    </View>
  );
}
export function Roles({
  value,
  onChange,
  disabled = false,
}: {
  value: AdminRole[];
  onChange: (roles: AdminRole[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {(Object.keys(roleLabels) as AdminRole[]).map((role) => {
        const on = value.includes(role);
        return (
          <Pressable
            key={role}
            accessibilityRole="button"
            accessibilityLabel={(on ? 'Selected: ' : 'Add role: ') + roleLabels[role]}
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => onChange(on ? value.filter((v) => v !== role) : [...value, role])}
            style={[styles.role, on && styles.roleOn, disabled && { opacity: 0.5 }]}
          >
            {on ? <Check size={16} color={colors.surface} /> : null}
            <Text
              className="font-heading text-sm"
              style={{ color: on ? colors.surface : colors.primary }}
            >
              {roleLabels[role]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function AdminError({ error }: { error: unknown; retry?: () => void }) {
  return (
    <AdminCard>
      <Copy alert>{safeMessage(error)}</Copy>
    </AdminCard>
  );
}
const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: {
    ...mobileSurfaces.icyCard,
    ...premiumShadow,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderColor: mobileSurfaces.icyCard.borderColor,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  role: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleOn: { backgroundColor: colors.deep, borderColor: colors.deep },
  input: {
    color: colors.text,
    backgroundColor: colors.icy,
    borderRadius: radii.input,
    minHeight: spacing.touch,
    padding: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
  },
});
