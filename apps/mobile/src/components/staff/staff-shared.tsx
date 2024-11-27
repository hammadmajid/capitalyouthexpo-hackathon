import { NumericTextInput as TextInput } from '../grouped-number-input';
import { Pressable, Text, View, type TextInputProps } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '@hsm/api-client';
import { marketplacePrice } from '@hsm/api-client';
import type { StaffSalary } from '@hsm/contracts';
import { mobileColors as c, mobileOwnerColors, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { useNativeCommand } from '../services/use-command';
// CHG-039: one Staff module shared by Owner and Manager; the server decides what each sees.
export const staffKey = (actorId: string, branchId: string) => ['staff', actorId, branchId];
export function useStaffRead<T>(
  actorId: string,
  branchId: string,
  part: unknown[],
  read: (client: ApiClient) => Promise<T>,
) {
  return useQuery({
    queryKey: [...staffKey(actorId, branchId), ...part],
    gcTime: 0,
    retry: false,
    queryFn: async () => read(await actorClient(actorId)),
  });
}
// Every staff change refreshes the branch's staff list, detail and dashboard together.
export function useStaffCommand<T>(
  operation: string,
  actorId: string,
  branchId: string,
  run: (client: ApiClient, body: T, key: string) => Promise<unknown>,
) {
  return useNativeCommand<T>(operation + ':' + branchId, actorId, run, [
    staffKey(actorId, branchId),
    ['owner-dashboard', actorId],
  ]);
}
export const jobTitles = {
  receptionist: 'Receptionist',
  security_guard: 'Security guard',
  cleaner: 'Cleaner',
  cook: 'Cook',
  maintenance: 'Maintenance',
  supervisor: 'Supervisor',
  other: 'Other',
} as const;
export const methods = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  mobile_wallet: 'Mobile wallet',
  other: 'Other',
} as const;
export const pkr = (paisa: number) => marketplacePrice(paisa);
// Whole rupees typed by people become exact integer paisa.
export function rupeesToPaisa(text: string) {
  const clean = text.replace(/[,\s]/g, '');
  return /^\d{1,9}$/.test(clean) ? Number(clean) * 100 : undefined;
}
export function todayKarachi() {
  return new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
}
const tones = {
  paid: { label: 'Paid', color: c.success },
  unpaid: { label: 'Unpaid', color: c.secondary },
  due: { label: 'Due today', color: mobileOwnerColors.warning },
  overdue: { label: 'Overdue', color: c.dangerText },
} as const;
// Timing and money progress are shown together so "partial" never hides "overdue".
export function SalaryChip({ salary }: { salary: StaffSalary }) {
  const tone = tones[salary.timing];
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      <Chip label={tone.label} color={tone.color} />
      {salary.partial ? <Chip label="Partly paid" color={c.primary} /> : null}
    </View>
  );
}
export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: color,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}
export function Field(props: TextInputProps & { label: string }) {
  const { label, ...input } = props;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.secondary, fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.placeholder}
        {...input}
        style={{
          minHeight: 48,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: mobileSurfaces.icyCard.borderColor,
          backgroundColor: c.inputSurface,
          color: c.heading,
        }}
      />
    </View>
  );
}
export function Choice<T extends string>(props: {
  label: string;
  options: Record<T, string>;
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.secondary, fontSize: 13 }}>{props.label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(props.options) as T[]).map((key) => {
          const on = props.value === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={props.options[key]}
              accessibilityState={{ selected: on }}
              onPress={() => props.onChange(key)}
              style={{
                minHeight: 40,
                paddingHorizontal: 14,
                borderRadius: 20,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: on ? c.deep : mobileSurfaces.icyCard.borderColor,
                backgroundColor: on ? c.deep : c.surface,
              }}
            >
              <Text style={{ color: on ? c.surface : c.primary, fontWeight: '600' }}>
                {props.options[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
export function Panel({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        ...mobileSurfaces.icyCard,
        borderWidth: 1,
        borderRadius: 20,
        padding: 14,
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}
