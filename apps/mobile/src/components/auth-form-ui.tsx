import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowRight, Mail } from 'lucide-react-native';
import { icons, mobileColors, natureLoginColors as c, natureLoginMetrics as m } from '@hsm/ui';
import type { FlowInputProps } from './flow-input';
import type { Button } from './ui';
import { LoginField } from './login-field';

export function AuthLabel({ children }: { children: ReactNode }) {
  return children === 'Email address' || children === 'Six-digit email code' ? null : (
    <Text style={styles.label}>{children}</Text>
  );
}
export function AuthCodeInput({ field, value, change, blur, disabled }: FlowInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.codeGroup}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.codes}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <View
            key={index}
            style={[styles.cell, focused && index === Math.min(value.length, 5) && styles.focused]}
          >
            <Text style={[styles.digit, !value[index] && styles.empty]}>{value[index] ?? '·'}</Text>
          </View>
        ))}
      </View>
      <TextInput
        accessibilityLabel={field.label}
        accessibilityState={{ disabled }}
        testID={'field-' + field.name}
        value={value}
        onChangeText={(next) => change(next.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          blur();
        }}
        editable={!disabled}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        caretHidden
        selectionColor="transparent"
        cursorColor="transparent"
        underlineColorAndroid="transparent"
        importantForAccessibility="yes"
        style={styles.codeInput}
      />
    </View>
  );
}
export function AuthInput(props: FlowInputProps) {
  const { field, value, change, blur, disabled } = props;
  if (field.name === 'code') return <AuthCodeInput {...props} />;
  const name = field.secret ? 'password' : field.keyboard === 'phone-pad' ? 'phone' : 'email';
  const placeholder =
    field.placeholder ??
    (name === 'email'
      ? 'Enter your email address'
      : name === 'phone'
        ? 'Enter invited mobile number'
        : 'Enter ' + field.label.toLowerCase());
  return (
    <LoginField
      name={name}
      value={value}
      onChange={change}
      blur={blur}
      error={undefined}
      disabled={disabled}
      label={field.label}
      placeholder={placeholder}
      testID={'field-' + field.name}
      rounded
      autoComplete={
        field.name === 'tempPassword'
          ? 'off'
          : field.secret
            ? 'new-password'
            : name === 'email'
              ? 'email'
              : 'tel'
      }
    />
  );
}
export const AuthButton: typeof Button = ({
  label,
  onPress,
  disabled = false,
  secondary = false,
}) => {
  const busy = disabled && label === 'Please wait…';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: secondary ? c.divider : c.glassHighlight }}
      style={[
        styles.button,
        secondary ? styles.secondary : styles.primary,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator accessible={false} color={secondary ? c.primary : c.surface} />
      ) : null}
      <Text style={[styles.buttonText, { color: secondary ? c.primary : c.surface }]}>{label}</Text>
      {!secondary && !busy ? (
        <ArrowRight
          accessible={false}
          size={m.iconSize}
          strokeWidth={icons.strokeWidth}
          color={c.surface}
        />
      ) : null}
    </Pressable>
  );
};
export function AuthEmailBadge({ email }: { email: string }) {
  const at = email.lastIndexOf('@');
  const masked = at > 0 ? email.slice(0, Math.min(2, at)) + '***' + email.slice(at) : 'Email';
  return (
    <View style={styles.email}>
      <Mail
        accessible={false}
        size={m.iconSize}
        color={c.primary}
        strokeWidth={icons.strokeWidth}
      />
      <Text style={styles.emailText}>{masked}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  label: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: m.fieldSize, color: c.heading },
  button: {
    minHeight: m.buttonHeight,
    borderRadius: m.page,
    paddingVertical: m.md,
    paddingHorizontal: m.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.sm,
  },
  primary: {
    backgroundColor: c.primary,
    boxShadow: [{ offsetX: 0, offsetY: m.sm, blurRadius: m.lg, color: c.shadow }],
  },
  secondary: { borderWidth: 1, borderColor: c.outline, backgroundColor: c.glass },
  disabled: { opacity: 0.65 },
  buttonText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: m.controlSize,
    textAlign: 'center',
    flexShrink: 1,
  },
  codeGroup: { position: 'relative', minHeight: m.inputHeight },
  codes: { flexDirection: 'row', gap: m.sm },
  cell: {
    flex: 1,
    minWidth: 0,
    height: m.inputHeight,
    borderRadius: m.inputRadius - m.xs,
    borderWidth: 1,
    borderColor: c.outline,
    backgroundColor: c.input,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focused: { borderColor: c.primary, backgroundColor: c.focusSurface },
  digit: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: m.codeSize, color: c.heading },
  empty: { color: c.outline },
  // Keep Android's native edit/autofill text from competing with the six cells.
  // The near-transparent overlay remains touchable and accessible.
  codeInput: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.01,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 1,
  },
  email: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.md,
    backgroundColor: c.input,
    borderWidth: 1,
    borderColor: mobileColors.cardBorder,
    borderRadius: m.page,
    padding: m.lg,
    marginBottom: m.xxl,
  },
  emailText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: m.fieldSize,
    color: c.secondary,
    flexShrink: 1,
  },
});
