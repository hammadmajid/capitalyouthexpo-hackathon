import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import {
  Banknote,
  CreditCard,
  Ellipsis,
  Landmark,
  Plus,
  Smartphone,
  Trash2,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import type { PaymentInstruction } from '@hsm/contracts';

export const paymentMethodLabels: Record<string, string> = {
  bank_transfer: 'Bank transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  cash: 'Cash',
  other: 'Other',
};
export function PaymentMethodIcon({
  method,
  selected = false,
}: {
  method: string;
  selected?: boolean;
}) {
  const Icon =
    (
      {
        bank_transfer: Landmark,
        jazzcash: Smartphone,
        easypaisa: Wallet,
        cash: Banknote,
        other: Ellipsis,
      } as Record<string, LucideIcon>
    )[method] ?? Wallet;
  return <Icon size={20} color={selected ? c.surface : c.primary} />;
}
export function PaymentPart({
  Icon,
  title,
  raised = false,
}: {
  Icon: LucideIcon;
  title: string;
  raised?: boolean;
}) {
  return (
    <View style={s.part}>
      <View style={raised ? s.icon : undefined}>
        <Icon size={22} color={c.primary} />
      </View>
      <Text accessibilityRole="header" className="font-heading" style={s.partTitle}>
        {title}
      </Text>
    </View>
  );
}
export function PaymentChoice({
  text,
  label,
  selected,
  disabled,
  onPress,
  method,
}: {
  text: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  method?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[s.choice, selected && s.selected]}
    >
      {method ? <PaymentMethodIcon method={method} selected={selected} /> : null}
      <Text className="font-heading" style={[s.choiceText, selected && { color: c.surface }]}>
        {text}
      </Text>
    </Pressable>
  );
}
export function PaymentAccountCard({
  row,
  owner,
  busy,
  remove,
}: {
  row: PaymentInstruction;
  owner: boolean;
  busy: boolean;
  remove: () => void;
}) {
  return (
    <View style={s.account}>
      <View style={s.icon}>
        <PaymentMethodIcon method={row.method} />
      </View>
      <View style={s.accountText}>
        <Text className="font-heading" style={s.partTitle}>
          {paymentMethodLabels[row.method] ?? row.method}
        </Text>
        <Text className="font-body" style={s.accountDetail}>
          {row.accountTitle} · {row.accountIdentifier}
        </Text>
      </View>
      {owner ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Remove ' + row.accountTitle}
          disabled={busy}
          hitSlop={8}
          onPress={remove}
          style={s.remove}
        >
          <Trash2 size={22} color={c.dangerText} />
        </Pressable>
      ) : null}
    </View>
  );
}
export function PaymentField({ kind, ...props }: TextInputProps & { kind: 'name' | 'account' }) {
  const Icon = kind === 'name' ? UserRound : CreditCard;
  return (
    <View style={s.field}>
      <Icon size={20} color={c.primary} />
      <TextInput
        {...props}
        placeholderTextColor={c.placeholder}
        className="font-body"
        style={s.input}
      />
    </View>
  );
}
export function PaymentAdd({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add account"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.add, disabled && { opacity: 0.5 }]}
    >
      <Plus size={20} color={c.primary} />
      <Text className="font-heading" style={s.choiceText}>
        Add account
      </Text>
    </Pressable>
  );
}
export const paymentSettingsStyles = StyleSheet.create({
  upfront: {
    ...mobileSurfaces.icyCard,
    padding: m.smallGap + 4,
    borderRadius: m.cardRadius,
    gap: m.smallGap,
    borderWidth: 1,
    borderColor: c.surface,
  },
  section: {
    gap: m.smallGap,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: m.smallGap + 4,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: m.smallGap },
});
const s = StyleSheet.create({
  part: { flexDirection: 'row', alignItems: 'center', gap: m.smallGap },
  partTitle: { color: c.heading, fontSize: m.body, flexShrink: 1 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: m.inputRadius,
    backgroundColor: c.aqua,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choice: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: m.smallGap,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: m.smallGap,
    maxWidth: '100%',
    backgroundColor: c.inputSurface,
  },
  selected: { backgroundColor: c.primary, borderColor: c.primary },
  choiceText: { color: c.primary, fontSize: m.small, flexShrink: 1 },
  account: {
    ...mobileSurfaces.icyCard,
    borderWidth: 1,
    borderColor: c.surface,
    borderRadius: m.cardRadius,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.smallGap,
  },
  accountText: { flex: 1, minWidth: 0, gap: 3 },
  accountDetail: { color: c.secondary, fontSize: m.small, lineHeight: m.small + 6 },
  remove: { padding: m.smallGap },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.smallGap,
    minHeight: 48,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: m.inputRadius,
    paddingHorizontal: 14,
    backgroundColor: c.inputSurface,
  },
  input: { flex: 1, minWidth: 0, fontSize: m.small, color: c.heading, paddingVertical: 12 },
  add: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: m.smallGap,
    minHeight: m.touch,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.primary,
    backgroundColor: c.icy,
    marginTop: m.smallGap,
  },
});
