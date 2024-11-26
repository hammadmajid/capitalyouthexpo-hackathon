import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff, Lock, Mail, Phone } from 'lucide-react-native';
import { icons, natureLoginColors as c, natureLoginMetrics as m } from '@hsm/ui';
type Name = 'email' | 'phone' | 'password';
const settings: Record<
  Name,
  {
    label: string;
    placeholder: string;
    Icon: typeof Mail;
    keyboardType: TextInputProps['keyboardType'];
    autoComplete: TextInputProps['autoComplete'];
    color: string;
  }
> = {
  email: {
    label: 'Email',
    placeholder: 'Enter your email address',
    Icon: Mail,
    keyboardType: 'email-address',
    autoComplete: 'email',
    color: c.primary,
  },
  phone: {
    label: 'Phone Number',
    placeholder: 'Enter your phone number',
    Icon: Phone,
    keyboardType: 'phone-pad',
    autoComplete: 'tel',
    color: c.primary,
  },
  password: {
    label: 'Password',
    placeholder: 'Password',
    Icon: Lock,
    keyboardType: 'default',
    autoComplete: 'current-password',
    color: c.primary,
  },
};
function PasswordVisibility({
  visible,
  disabled,
  toggle,
  label = 'password',
}: {
  visible: boolean;
  disabled: boolean;
  toggle: () => void;
  label?: string;
}) {
  const Icon = visible ? Eye : EyeOff;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={(visible ? 'Hide ' : 'Show ') + label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={toggle}
      android_ripple={{ color: c.divider, borderless: false }}
      style={styles.visibility}
    >
      <Icon
        accessible={false}
        color={c.heading}
        size={m.iconSize}
        strokeWidth={icons.strokeWidth}
      />
    </Pressable>
  );
}
interface LoginFieldProps {
  name: Name;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  disabled: boolean;
  label?: string;
  placeholder?: string;
  testID?: string;
  rounded?: boolean;
  blur?: () => void;
  autoComplete?: TextInputProps['autoComplete'];
}
export function LoginField({
  name,
  value,
  onChange,
  error,
  disabled,
  label,
  placeholder,
  testID,
  rounded = false,
  blur,
  autoComplete,
}: LoginFieldProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!value) setVisible(false);
  }, [value]);
  const secret = name === 'password';
  // Name is a closed local enum, never an external object path.
  const option = settings[name];
  const Icon = option.Icon;
  const input: TextInputProps = {
    accessibilityLabel: label ?? option.label,
    testID: testID ?? 'field-' + name,
    value,
    onChangeText: onChange,
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      blur?.();
    },
    autoCapitalize: 'none',
    autoCorrect: false,
    placeholder: placeholder ?? option.placeholder,
    placeholderTextColor: c.secondary,
    editable: !disabled,
    accessibilityState: { disabled },
    keyboardType: option.keyboardType,
    autoComplete: autoComplete ?? option.autoComplete,
    secureTextEntry: secret && !visible,
  };
  return (
    <View style={styles.group}>
      <View
        style={[
          styles.field,
          rounded && styles.rounded,
          { borderColor: error ? c.error : focused ? c.primary : c.inputBorder },
          focused && { backgroundColor: c.focusSurface },
        ]}
      >
        <Icon
          accessible={false}
          color={error ? c.error : option.color}
          size={m.iconSize}
          strokeWidth={icons.strokeWidth}
        />
        <TextInput {...input} style={styles.input} />
        {secret ? (
          <PasswordVisibility
            visible={visible}
            disabled={disabled}
            label={label ?? 'password'}
            toggle={() => setVisible((current) => !current)}
          />
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: m.xs },
  rounded: { borderRadius: m.page },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: m.inputHeight,
    borderWidth: 1,
    borderRadius: m.inputRadius,
    backgroundColor: c.input,
    paddingLeft: m.lg,
    gap: m.md,
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 4, color: c.softShadow }],
  },
  input: {
    textAlignVertical: 'center',
    includeFontPadding: false,
    flex: 1,
    minWidth: 0,
    minHeight: m.inputHeight,
    paddingVertical: m.md,
    paddingRight: m.md,
    color: c.dark,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: m.fieldSize,
  },
  visibility: {
    minWidth: m.touch,
    minHeight: m.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: m.inputRadius,
  },
  error: { color: c.error, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13 },
});
