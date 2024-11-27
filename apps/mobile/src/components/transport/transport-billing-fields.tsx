import { NumericTextInput as TextInput } from '../grouped-number-input';
import { Pressable, Text, View } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
const titleStyle = 'font-heading text-sm text-heading';
const detailStyle = 'font-body text-xs text-secondary';

export function BillingChoice({
  label,
  detail,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const Icon = selected ? CheckCircle2 : Circle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      className={
        'min-h-12 flex-row items-center gap-2 rounded-input border bg-icy px-3 py-2 ' +
        (selected ? 'border-primary' : 'border-border')
      }
    >
      <Icon color={selected ? colors.primary : colors.secondary} size={18} />
      <View className={detail ? 'flex-1 gap-1' : ''}>
        <Text className={titleStyle}>{label}</Text>
        {detail ? <Text className={detailStyle}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

export function BillingNumberField({
  label,
  name,
  example,
  decimal,
  value,
  disabled,
  change,
}: {
  label: string;
  name: string;
  example: string;
  decimal?: boolean;
  value: string;
  disabled: boolean;
  change: (value: string) => void;
}) {
  return (
    <View style={{ flexBasis: '45%', flexGrow: 1 }} className="gap-1">
      <Text className={titleStyle}>{label}</Text>
      <TextInput
        accessibilityLabel={name}
        placeholder={example}
        placeholderTextColor={colors.secondary}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        maxLength={decimal ? 17 : 2}
        value={value}
        onChangeText={change}
        editable={!disabled}
        className="min-h-12 rounded-input border border-border bg-icy px-3 font-body text-body text-text"
      />
    </View>
  );
}
