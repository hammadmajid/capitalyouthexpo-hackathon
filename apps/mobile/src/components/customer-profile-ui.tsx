import { NatureBackground, PremiumSurface } from './visual-surfaces';
import { PullScrollView } from './pull-refresh';
import { mobileSurfaces } from '@hsm/ui';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  Check,
  GraduationCap,
  IdCard,
  Mail,
  Phone,
  Pencil,
  UserRound,
  UsersRound,
} from 'lucide-react-native';
import { mobileColors as colors, icons, radii, spacing, typography } from '@hsm/ui';
import { AppHeader, NavIconButton } from './navigation/header';
import type { ProfileDetails } from '@hsm/contracts';
import type { ChoiceProps } from './flow-form';
import type { FlowInputProps } from './flow-input';
import { Button } from './ui';
import { readOwnFileUrl } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';

export function CustomerProfileScreen({
  busy,
  edit,
  onBack,
  title = 'Customer profile',
  children,
}: {
  busy: boolean;
  edit?: () => void;
  // An explicit Back target (a Manager's first-time profile must not loop back to /manager).
  onBack?: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={s.page}>
      <NatureBackground mint />
      <PullScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={s.content}
      >
        <AppHeader
          title={title}
          backTo="/account"
          {...(onBack ? { onBack } : {})}
          backDisabled={busy}
          actions={
            edit ? (
              <NavIconButton label="Edit profile" onPress={edit}>
                <Pencil color={colors.primary} size={icons.size} />
              </NavIconButton>
            ) : null
          }
        />
        {children}
      </PullScrollView>
    </SafeAreaView>
  );
}

export function CustomerProfilePhoto({
  userId,
  fileId,
  children,
}: {
  userId: string;
  fileId?: string | undefined;
  children?: ReactNode;
}) {
  const [preview, setPreview] = useState<{ userId: string; fileId: string; uri: string }>();
  useEffect(() => {
    if (!fileId) return;
    let active = true;
    void actorClient(userId)
      .then((client) => readOwnFileUrl(client, fileId))
      .then(({ url }) => {
        if (active) setPreview({ userId, fileId, uri: url });
      })
      .catch(() => {
        if (active) setPreview(undefined);
      });
    return () => {
      active = false;
    };
  }, [userId, fileId]);
  const uri =
    preview && preview.userId === userId && preview.fileId === fileId ? preview.uri : undefined;
  return (
    <View style={[s.card, s.photoPanel]}>
      <View pointerEvents="none" style={s.photoBackdrop}>
        <PremiumSurface mint />
      </View>
      <View style={s.avatar}>
        {uri ? (
          <Image
            accessibilityLabel="Profile photo"
            source={{ uri }}
            style={s.photoImage}
            onError={() => setPreview((current) => (current?.uri === uri ? undefined : current))}
          />
        ) : (
          <UserRound color={colors.primary} size={spacing.page} accessible={false} />
        )}
        {children}
      </View>
      <Text accessibilityRole="header" className="font-heading text-body text-heading">
        Profile photo
      </Text>
    </View>
  );
}

export function CustomerPhotoAction(props: ComponentProps<typeof Button>) {
  if (!props.label.startsWith('Choose ') && !props.label.startsWith('Edit '))
    return <Button {...props} />;
  const PhotoIcon = props.Icon ?? Camera;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled ?? false }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={s.camera}
    >
      <View style={[s.cameraBadge, props.disabled && s.cameraDisabled]}>
        <PhotoIcon size={icons.size - spacing.xs} color={colors.surface} accessible={false} />
      </View>
    </Pressable>
  );
}

export function CustomerProfileInformation({ children }: { children: ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.summaryRow}>
        <View style={s.fieldIcon}>
          <UserRound color={colors.primary} size={icons.size} accessible={false} />
        </View>
        <Text accessibilityRole="header" className="font-heading text-body text-heading">
          Personal information
        </Text>
      </View>
      {children}
    </View>
  );
}

export function CustomerProfileEmail({ email }: { email: string | null }) {
  if (!email) return null;
  return (
    <View style={s.summaryRow}>
      <View style={s.fieldIcon}>
        <Mail color={colors.primary} size={icons.size} accessible={false} />
      </View>
      <View style={s.fieldContent}>
        <Text className="font-body text-sm text-secondary">Email</Text>
        <Text className="font-heading text-body text-heading">{email}</Text>
      </View>
      <BadgeCheck color={colors.primary} size={icons.size} accessibilityLabel="Email verified" />
    </View>
  );
}

export function CustomerProfileSummary({
  details,
  saved,
}: {
  details: ProfileDetails;
  saved: boolean;
}) {
  const values = [
    ['Full name', details.fullName, UserRound],
    ['Mobile number', details.phone, Phone],
    ['Age', details.customer?.age, CalendarDays],
    [
      'Gender',
      details.gender === 'male' ? 'Male' : details.gender === 'female' ? 'Female' : null,
      UsersRound,
    ],
    ['Institution', details.customer?.institution, GraduationCap],
    ['CNIC', details.cnicLast4 ? `Ending in ${details.cnicLast4}` : null, IdCard],
  ] as const;
  return (
    <>
      {saved ? (
        <Text accessibilityLiveRegion="polite" className="font-heading text-primary">
          Profile saved
        </Text>
      ) : null}
      {values
        .filter(([, value]) => value != null && value !== '')
        .map(([label, value, Icon], index) => (
          <View key={label} style={s.summaryRow}>
            <View style={s.fieldIcon}>
              <Icon color={colors.primary} size={icons.size} accessible={false} />
            </View>
            <View style={[s.fieldContent, index > 0 && s.divider]}>
              <Text className="font-body text-sm text-secondary">{label}</Text>
              <Text className="font-heading text-body text-heading">{value}</Text>
            </View>
          </View>
        ))}
    </>
  );
}
export function CustomerProfileInput({ field, value, change, blur, disabled }: FlowInputProps) {
  const [focused, setFocused] = useState(false);
  const Icon =
    field.name === 'phone'
      ? Phone
      : field.name === 'age'
        ? CalendarDays
        : field.name === 'institution'
          ? GraduationCap
          : UserRound;
  return (
    <View style={[s.input, { borderColor: focused ? colors.primary : colors.border }]}>
      <Icon color={colors.primary} size={icons.size} accessible={false} />
      <TextInput
        accessibilityLabel={field.label}
        testID={'field-' + field.name}
        value={value}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          blur();
        }}
        editable={!disabled && !field.readOnly}
        autoCorrect={false}
        autoCapitalize={field.name === 'phone' ? 'none' : 'words'}
        keyboardType={field.keyboard ?? 'default'}
        maxLength={field.maxLength ?? 120}
        autoComplete={field.name === 'phone' ? 'tel' : field.name === 'fullName' ? 'name' : 'off'}
        returnKeyType="done"
        style={s.textInput}
      />
    </View>
  );
}
export function CustomerProfileChoice({ label, selected, onPress, disabled }: ChoiceProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.aqua }}
      style={[s.choice, selected && s.selected]}
    >
      <Text
        className="font-heading text-body"
        style={{ color: selected ? colors.surface : colors.primary }}
      >
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </Text>
      {selected ? <Check size={icons.size} color={colors.surface} accessible={false} /> : null}
    </Pressable>
  );
}
export function CustomerProfileSubmit({
  label,
  onPress,
  disabled = false,
}: ComponentProps<typeof Button>) {
  const busy = label === 'Please wait…';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Saving Customer profile' : label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: colors.aqua }}
      style={[s.submit, { opacity: disabled ? 0.65 : 1 }]}
    >
      {busy ? <ActivityIndicator color={colors.surface} accessible={false} /> : null}
      <Text className="font-heading text-body text-surface">
        {busy ? 'Saving…' : 'Save profile'}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.page,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  photoPanel: { alignItems: 'center', paddingVertical: spacing.lg, gap: 0 },
  photoBackdrop: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.large - 1,
    overflow: 'hidden',
  },
  avatar: {
    width: spacing.touch * 2,
    height: spacing.touch * 2,
    borderRadius: radii.pill,
    backgroundColor: colors.aqua,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: '100%', borderRadius: radii.pill },
  camera: {
    width: spacing.touch,
    height: spacing.touch,
    position: 'absolute',
    top: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  cameraBadge: {
    ...mobileSurfaces.emeraldGlass,
    width: spacing.section + spacing.xs,
    height: spacing.section + spacing.xs,
    borderWidth: 1,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraDisabled: { opacity: 0.55 },
  card: {
    ...mobileSurfaces.glassEdge,
    backgroundColor: `${colors.icy}90`,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    borderRadius: radii.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fieldIcon: {
    width: spacing.page,
    height: spacing.page,
    borderRadius: radii.pill,
    backgroundColor: colors.aqua,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldContent: { flex: 1, gap: spacing.xs, paddingVertical: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: spacing.touch + spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.icy,
    borderWidth: 1,
    borderRadius: radii.input,
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    minHeight: spacing.touch + spacing.sm,
    color: colors.text,
    fontSize: typography.body,
    fontFamily: 'PlusJakartaSans_400Regular',
    paddingVertical: spacing.sm,
  },
  choice: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: spacing.touch,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.input,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.icy,
  },
  selected: { backgroundColor: colors.deep },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: spacing.touch + spacing.sm,
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.primary,
  },
});
