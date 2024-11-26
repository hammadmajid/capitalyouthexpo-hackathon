import { GroupedNumberInput } from './grouped-number-input';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { mobileColors as colors, mobileSurfaces, icons } from '@hsm/ui';
import type { Field } from './flow-form';
export interface FlowInputProps {
  field: Field;
  value: string;
  change: (value: string) => void;
  blur: () => void;
  disabled: boolean;
}
export function FlowInput({ field, value, change, blur, disabled }: FlowInputProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!value) setVisible(false);
  }, [value]);
  const props: TextInputProps = {
    accessibilityLabel: field.label,
    testID: 'field-' + field.name,
    value,
    onChangeText: change,
    onBlur: blur,
    autoCapitalize: 'none',
    autoCorrect: false,
    secureTextEntry: Boolean(field.secret && !visible),
    keyboardType: field.keyboard ?? 'default',
    multiline: field.secret ? false : field.multiline,
    maxLength: field.maxLength,
    textAlignVertical: field.multiline ? 'top' : 'center',
    autoComplete: field.secret ? 'off' : undefined,
    placeholder: field.placeholder,
    placeholderTextColor: colors.placeholder,
    editable: !disabled && !field.readOnly,
  };
  const Numeric =
    field.numberFormat === 'grouped' ||
    (['number-pad', 'decimal-pad'].includes(field.keyboard ?? '') && field.numberFormat !== 'plain')
      ? GroupedNumberInput
      : TextInput;
  if (!field.secret)
    return (
      <Numeric
        {...props}
        style={mobileSurfaces.input}
        className={
          (field.multiline ? 'min-h-24 ' : 'min-h-12 ') +
          'rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text'
        }
      />
    );
  const Icon = visible ? EyeOff : Eye;
  return (
    <View
      style={mobileSurfaces.input}
      className="min-h-12 flex-row items-center rounded-input border border-border bg-inputSurface"
    >
      <TextInput
        {...props}
        className="min-h-12 min-w-0 flex-1 px-4 py-3 font-body text-body text-text"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={(visible ? 'Hide ' : 'Show ') + field.label}
        testID={'toggle-field-' + field.name}
        accessibilityState={{ disabled, selected: visible }}
        disabled={disabled}
        onPress={() => setVisible((current) => !current)}
        className="min-h-12 min-w-12 items-center justify-center"
      >
        <Icon size={icons.size} strokeWidth={icons.strokeWidth} color={colors.primary} />
      </Pressable>
    </View>
  );
}
