import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { CircleCheck, IdCard } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
// CHG-054: 13 digits shown as 00000-0000000-0 while typing.
export function formatCnic(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  return [digits.slice(0, 5), digits.slice(5, 12), digits.slice(12)].filter(Boolean).join('-');
}
export function cnicComplete(value: string) {
  return /^\d{5}-\d{7}-\d$/.test(value);
}
// One premium card: ID icon, big spaced digits, a tick when all 13 are in. No helper text.
export function CnicField(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  action?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const done = cnicComplete(props.value);
  const partial = props.value.length > 0 && !done && !focused;
  return (
    <View
      style={[
        styles.card,
        focused && { borderColor: c.primary },
        done && { borderColor: c.primary, backgroundColor: c.icy },
        partial && { borderColor: c.dangerText },
      ]}
    >
      <View
        accessible={done && Boolean(props.action)}
        accessibilityLabel={done && props.action ? 'CNIC complete' : undefined}
        style={[styles.icon, done && { backgroundColor: c.primary }]}
      >
        <IdCard size={26} color={done ? c.surface : c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text className="font-body" style={styles.label}>
          CNIC
        </Text>
        <TextInput
          accessibilityLabel="CNIC"
          value={props.value}
          onChangeText={(text) => props.onChange(formatCnic(text))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!props.disabled}
          keyboardType="number-pad"
          maxLength={15}
          placeholder="00000-0000000-0"
          placeholderTextColor={c.placeholder}
          className="font-heading"
          style={[styles.input, props.action ? { fontSize: 18, letterSpacing: 0.5 } : undefined]}
        />
      </View>
      {props.action}
      {done && !props.action ? (
        <View accessible accessibilityLabel="CNIC complete">
          <CircleCheck size={26} color={c.primary} />
        </View>
      ) : null}
    </View>
  );
}
// The customer's account already holds a CNIC: one quiet line, never the number.
export function CnicOnFile() {
  return (
    <View style={[styles.card, { minHeight: 60 }]} accessible accessibilityLabel="CNIC on file">
      <View style={[styles.icon, { backgroundColor: c.primary }]}>
        <IdCard size={24} color={c.surface} />
      </View>
      <Text className="font-heading" style={[styles.input, { flex: 1, fontSize: 17 }]}>
        CNIC on file
      </Text>
      <CircleCheck size={24} color={c.primary} />
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    ...mobileSurfaces.icyCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.icy,
  },
  label: { color: c.secondary, fontSize: 13 },
  input: { color: c.heading, fontSize: 20, fontWeight: '700', letterSpacing: 1.5, padding: 0 },
});
