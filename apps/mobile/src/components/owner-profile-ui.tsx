import type { ComponentProps, ReactNode } from 'react';
import { PullScrollView } from './pull-refresh';
import { createContext, useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import { AppHeader } from './navigation/header';
import { NatureBackground } from './visual-surfaces';
import type { FlowInputProps } from './flow-input';
import { SetupButton } from './owner-wizard-ui';
import type { Button } from './ui';
import { ownerFieldError } from '../lib/owner-profile-error';

export const OwnerProfileValidation = createContext({ submitted: false, photoBusy: false });

export function OwnerProfileShell({
  children,
  back,
  busy = false,
  title = 'Owner profile',
  actions,
}: {
  children: ReactNode;
  back: () => void;
  busy?: boolean;
  title?: string;
  actions?: ReactNode;
}) {
  return (
    <SafeAreaView style={s.page}>
      <NatureBackground />
      <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <PullScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={s.content}
        >
          <AppHeader title={title} onBack={back} backDisabled={busy} actions={actions} />
          {children}
        </PullScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function OwnerSaveButton(props: ComponentProps<typeof Button>) {
  const { photoBusy } = useContext(OwnerProfileValidation);
  return <SetupButton {...props} disabled={props.disabled || photoBusy} />;
}

export function OwnerProfileInput({ field, value, change, blur, disabled }: FlowInputProps) {
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const { submitted } = useContext(OwnerProfileValidation);
  const error =
    !field.readOnly && (touched || submitted) ? ownerFieldError(field.name, value) : undefined;
  const Icon =
    field.name === 'phone'
      ? Phone
      : field.name === 'address'
        ? MapPin
        : field.name === 'cnic'
          ? ShieldCheck
          : field.name === 'organizationName'
            ? Building2
            : UserRound;
  return (
    <View style={{ gap: m.smallGap }}>
      <View style={[s.input, focused && s.focused, error && s.invalid]}>
        <Icon size={m.stepIcon} color={c.primary} accessible={false} />
        <TextInput
          accessibilityLabel={field.label}
          testID={'field-' + field.name}
          value={value}
          onChangeText={change}
          editable={!disabled && !field.readOnly}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setTouched(true);
            blur();
          }}
          keyboardType={field.keyboard ?? 'default'}
          autoCorrect={false}
          autoCapitalize={field.name === 'phone' || field.name === 'cnic' ? 'none' : 'words'}
          maxLength={field.maxLength ?? (field.name === 'address' ? 500 : 150)}
          autoComplete={field.name === 'phone' ? 'tel' : field.name === 'fullName' ? 'name' : 'off'}
          multiline={field.multiline}
          style={s.textInput}
        />
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="font-body"
          style={s.error}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  page: { flex: 1 },
  content: {
    padding: m.page,
    gap: m.section,
    width: '100%',
    maxWidth: m.contentMaxWidth,
    alignSelf: 'center',
    paddingBottom: m.page * 2,
  },
  input: {
    ...mobileSurfaces.input,
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.smallGap,
    borderWidth: 1,
    borderRadius: m.inputRadius,
    paddingHorizontal: m.gap,
    minHeight: m.touch,
  },
  focused: { borderColor: c.primary },
  invalid: { borderColor: c.alert },
  error: { color: c.alert, fontSize: m.small },
  textInput: {
    flex: 1,
    minWidth: 0,
    minHeight: m.touch,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: m.body + 1,
    color: c.text,
    paddingVertical: m.smallGap,
  },
});
