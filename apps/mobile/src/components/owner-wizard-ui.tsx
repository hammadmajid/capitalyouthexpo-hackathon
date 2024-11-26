import { setupStepKeys } from './owner-setup-steps';
import { PullScrollView } from './pull-refresh';
import { NatureBackground } from './visual-surfaces';
import { mobileSurfaces } from '@hsm/ui';
import { NavIconButton } from './navigation/header';
import { StaffSetupFooter } from './staff/staff-setup-footer';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Check, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import type { Button } from './ui';
import type { ChoiceProps } from './flow-form';
// Owner design language (2026-10-29 references): white cards, dark ink, emerald emphasis.
export function SetupButton({
  label,
  onPress,
  secondary = false,
  disabled = false,
  Icon,
}: ComponentProps<typeof Button> & { Icon?: LucideIcon | undefined }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary ? styles.secondaryButton : styles.primaryButton,
        disabled && styles.disabled,
      ]}
    >
      {Icon ? <Icon size={m.stepIcon} color={secondary ? c.primary : c.onPrimary} /> : null}
      <Text
        className="font-heading"
        style={[styles.buttonText, { color: secondary ? c.primary : c.onPrimary }]}
      >
        {label}
      </Text>
      {!secondary ? <ArrowRight size={m.stepIcon} color={c.onPrimary} /> : null}
    </Pressable>
  );
}
export function ChoiceTile({
  label,
  selected,
  onPress,
  disabled,
  compact = false,
  equalColumns = false,
}: ChoiceProps & {
  compact?: boolean;
  equalColumns?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        compact && { flexGrow: 0, flexBasis: 'auto' },
        equalColumns && { flexGrow: 0, flexBasis: '48%', shadowOpacity: 0, elevation: 0 },
        selected && styles.choiceSelected,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Check size={m.small} color={c.onPrimary} /> : null}
      </View>
      <Text
        className="font-heading"
        style={{ color: selected ? c.primary : c.text, flexShrink: 1 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="font-heading" style={styles.label}>
      {children}
    </Text>
  );
}
export function SetupCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function SetupText({
  children,
  muted = false,
  alert = false,
}: {
  children: ReactNode;
  muted?: boolean;
  alert?: boolean;
}) {
  return (
    <Text
      className="font-body"
      accessibilityRole={alert ? 'alert' : undefined}
      style={[styles.copy, { color: alert ? c.danger : muted ? c.secondary : c.text }]}
    >
      {children}
    </Text>
  );
}
export function SetupHeading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" className="font-heading" style={styles.sectionTitle}>
      {children}
    </Text>
  );
}
export function StatusChip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'due' | 'danger';
}) {
  const palette = {
    neutral: [c.inactive, c.secondary],
    success: [c.primarySoft, c.primary],
    warning: [c.warningSoft, c.warning],
    due: [c.dueSurface, c.dueText],
    danger: [c.dangerSoft, c.danger],
    info: [c.blueSoft, c.blue],
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette[0] }]}>
      <Text className="font-heading" style={{ color: palette[1], fontSize: m.small }}>
        {label}
      </Text>
    </View>
  );
}
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <SetupText muted>{label}</SetupText>
      <Text className="font-heading" style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}
export function SetupShell({
  title,
  subtitle,
  step,
  back,
  skip,
  compact = false,
  dense = false,
  staffLayout = false,
  footer,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  step?: number | undefined;
  back: () => void;
  skip?: (() => void) | undefined;
  compact?: boolean;
  dense?: boolean;
  staffLayout?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <NatureBackground mint={staffLayout || dense} />
      {dense ? (
        <View style={{ paddingHorizontal: 14, paddingTop: 3, paddingBottom: 10 }}>
          <View style={styles.top}>
            <NavIconButton onPress={back} />
            <Text
              accessibilityRole="header"
              className="font-heading"
              style={{ flex: 1, color: c.heading, fontSize: m.title }}
            >
              {title}
            </Text>
          </View>
        </View>
      ) : null}
      <PullScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.page, dense && { padding: 14, paddingTop: 3, gap: 10 }]}
      >
        {!dense ? (
          <View style={styles.top}>
            <NavIconButton onPress={back} />
            {compact ? (
              <Text
                accessibilityRole="header"
                className="font-heading"
                style={{ flex: 1, color: c.heading, fontSize: m.title }}
              >
                {title}
              </Text>
            ) : null}
            {step ? (
              <>
                <View
                  style={styles.track}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: setupStepKeys.length, now: step }}
                >
                  <View
                    style={[styles.progress, { width: `${(step / setupStepKeys.length) * 100}%` }]}
                  />
                </View>
                <SetupText muted>
                  Step {step} of {setupStepKeys.length}
                </SetupText>
              </>
            ) : null}
            {skip ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip for now"
                onPress={skip}
                style={styles.skip}
              >
                <Text className="font-heading" style={{ color: c.primary, fontSize: m.small }}>
                  Skip for now
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {(!compact || subtitle) && !staffLayout ? (
          <View style={styles.intro}>
            {!compact ? (
              <Text accessibilityRole="header" className="font-heading" style={styles.title}>
                {title}
              </Text>
            ) : null}
            {subtitle ? <SetupText muted>{subtitle}</SetupText> : null}
          </View>
        ) : null}
        {children}
      </PullScrollView>
      {footer ? <StaffSetupFooter>{footer}</StaffSetupFooter> : null}
    </SafeAreaView>
  );
}
export function SetupStepCard({
  number,
  title,
  description,
  Icon,
  active,
  status,
  completed = false,
  onPress,
}: {
  number: number;
  title: string;
  description: string;
  Icon: LucideIcon;
  active: boolean;
  status?: string | undefined;
  completed?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.stepRow}>
      <View
        style={[styles.badge, { backgroundColor: active || completed ? c.primary : c.inactive }]}
      >
        {completed ? (
          <Check size={m.stepIcon} color={c.onPrimary} />
        ) : (
          <Text className="font-heading" style={{ color: active ? c.onPrimary : c.heading }}>
            {number}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title + (status ? ', ' + status : '')}
        accessibilityState={{ selected: active }}
        testID={'setup-step-' + number}
        onPress={onPress}
        style={[styles.stepCard, active && styles.activeCard]}
      >
        <View style={[styles.icon, { backgroundColor: active ? c.surface : c.inactive }]}>
          <Icon size={m.stepIcon} color={active ? c.primary : c.secondary} />
        </View>
        <View style={styles.grow}>
          <Text className="font-heading" style={styles.cardTitle}>
            {title}
          </Text>
          <SetupText muted>{description}</SetupText>
          {status ? <StatusChip label={status} tone={completed ? 'success' : 'neutral'} /> : null}
        </View>
        <ChevronRight size={m.stepIcon} color={active ? c.primary : c.secondary} />
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  page: {
    padding: m.page,
    gap: m.section,
    maxWidth: m.contentMaxWidth,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: m.section * 2,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: m.gap, minHeight: m.touch },
  back: { width: m.touch, height: m.touch, justifyContent: 'center' },
  skip: { marginLeft: 'auto', minHeight: m.touch, justifyContent: 'center', flexShrink: 0 },
  intro: { gap: m.smallGap },
  title: { color: c.heading, fontSize: m.heading, lineHeight: m.heading + m.smallGap },
  sectionTitle: { color: c.heading, fontSize: m.title },
  label: { color: c.heading, fontSize: m.body },
  copy: { fontSize: m.body, lineHeight: m.title },
  card: {
    ...mobileSurfaces.icyCard,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderRadius: m.cardRadius,
    padding: m.cardPadding,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    gap: m.gap,
  },
  button: {
    minHeight: m.touch,
    borderRadius: m.inputRadius,
    paddingHorizontal: m.cardPadding,
    paddingVertical: m.gap,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.gap,
  },
  primaryButton: { backgroundColor: c.primary },
  secondaryButton: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  buttonText: { fontSize: m.body, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  choice: {
    ...mobileSurfaces.icyCard,
    minHeight: m.touch,
    flexGrow: 1,
    flexBasis: '40%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.smallGap,
    paddingHorizontal: m.gap,
    borderRadius: m.inputRadius,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
  },
  choiceSelected: { borderColor: c.primary, backgroundColor: c.primarySoft },
  radio: {
    width: m.stepIcon,
    height: m.stepIcon,
    borderRadius: m.stepIcon,
    borderWidth: 2,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: c.primary, backgroundColor: c.primary },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: m.cardRadius,
    paddingHorizontal: m.smallGap + 2,
    paddingVertical: 3,
  },
  infoRow: { gap: 2 },
  infoValue: { color: c.heading, fontSize: m.body },
  track: {
    flex: 1,
    backgroundColor: c.border,
    height: m.progressHeight,
    borderRadius: m.progressHeight,
    overflow: 'hidden',
  },
  progress: {
    backgroundColor: c.primary,
    height: m.progressHeight,
    borderRadius: m.progressHeight,
  },
  stepRow: { flexDirection: 'row', gap: m.gap, alignItems: 'center' },
  badge: {
    width: m.stepBadge,
    height: m.stepBadge,
    borderRadius: m.stepBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCard: {
    ...mobileSurfaces.icyCard,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.gap,
    borderRadius: m.cardRadius,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    padding: m.gap,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    minHeight: m.touch + m.section,
  },
  activeCard: { borderColor: c.primarySoft, backgroundColor: c.primarySoft },
  icon: {
    width: m.touch,
    height: m.touch,
    borderRadius: m.inputRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: m.body, color: c.heading },
  grow: { flex: 1, gap: m.smallGap },
});
