import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readManagerInventoryGrants, saveManagerInventoryGrants } from '@hsm/api-client';
import type { InventoryPermission } from '@hsm/contracts';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { useNativeCommand } from './services/use-command';
// CHG-039: only the owning Owner turns staff access on or off for a Manager. Both start off;
// salary access needs staff access too. Other grants are left exactly as they are.
export function OwnerManagerStaffAccess(props: {
  actorId: string;
  branchId: string;
  assignmentId: string;
  name: string;
}) {
  const queryKey = ['manager-grants', props.actorId, props.branchId, props.assignmentId];
  const grants = useQuery({
    queryKey,
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readManagerInventoryGrants(
        await actorClient(props.actorId),
        props.branchId,
        props.assignmentId,
      ),
  });
  const save = useNativeCommand<InventoryPermission[]>(
    'manager-staff-access:' + props.assignmentId,
    props.actorId,
    (client, permissions, key) =>
      saveManagerInventoryGrants(client, props.branchId, props.assignmentId, { permissions }, key),
    [queryKey],
  );
  const current = grants.data?.permissions ?? [];
  const staff = current.includes('staff_manage');
  const payroll = current.includes('staff_payroll_manage');
  function set(next: { staff: boolean; payroll: boolean }) {
    const others = current.filter((p) => p !== 'staff_manage' && p !== 'staff_payroll_manage');
    save.mutate([
      ...others,
      ...(next.staff ? (['staff_manage'] as const) : []),
      ...(next.staff && next.payroll ? (['staff_payroll_manage'] as const) : []),
    ]);
  }
  if (!grants.data)
    return grants.isError ? (
      <Text style={{ color: c.dangerText }}>{safeMessage(grants.error)}</Text>
    ) : null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Toggle
        label="Staff"
        on={staff}
        disabled={save.isPending}
        name={'Staff access for ' + props.name}
        onPress={() => set({ staff: !staff, payroll: staff ? false : payroll })}
      />
      <Toggle
        label="Salaries"
        on={payroll}
        disabled={save.isPending || !staff}
        name={'Salary access for ' + props.name}
        onPress={() => set({ staff, payroll: !payroll })}
      />
      {save.isError ? <Text style={{ color: c.dangerText }}>{safeMessage(save.error)}</Text> : null}
    </View>
  );
}
function Toggle(props: {
  label: string;
  name: string;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={props.name}
      accessibilityState={{ checked: props.on, disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 20,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: props.on ? c.deep : mobileSurfaces.icyCard.borderColor,
        backgroundColor: props.on ? c.deep : c.surface,
        opacity: props.disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: props.on ? c.surface : c.primary, fontWeight: '600' }}>
        {props.label} {props.on ? 'on' : 'off'}
      </Text>
    </Pressable>
  );
}
