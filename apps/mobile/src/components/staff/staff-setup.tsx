import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ChevronRight,
  PauseCircle,
  UserMinus,
  UserPlus,
  UserRound,
  UsersRound,
} from 'lucide-react-native';
import { listStaff } from '@hsm/api-client';
import type { StaffMember } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { StaffForm } from './staff-form';
import { jobTitles, useStaffRead } from './staff-shared';
import { staffSetupStyles as s } from './staff-setup-styles';
import { Skeleton } from '../loading/skeleton';

function StaffRow({ staff, edit }: { staff: StaffMember; edit: () => void }) {
  const role =
    staff.jobTitle === 'other' ? (staff.customTitle ?? 'Other') : jobTitles[staff.jobTitle];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Edit ' + staff.fullName}
      accessibilityHint={'Role: ' + role}
      onPress={edit}
      style={s.row}
    >
      <View style={s.avatar}>
        <UserRound color={c.primary} size={25} />
      </View>
      <Text className="font-heading" style={s.name}>
        {staff.fullName}
      </Text>
      <View style={s.badge}>
        <Text className="font-heading" style={s.role}>
          {role}
        </Text>
      </View>
      {staff.status === 'inactive' ? (
        <PauseCircle accessibilityLabel="Suspended" color={c.secondary} size={20} />
      ) : staff.status === 'ended' ? (
        <UserMinus accessibilityLabel="Removed" color={c.secondary} size={20} />
      ) : null}
      <ChevronRight color={c.secondary} size={20} />
    </Pressable>
  );
}
// Staff setup owns directory, employment status and salary terms. Operations retains payments/history.
export function StaffSetup({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [editing, setEditing] = useState<StaffMember | 'new'>();
  const list = useStaffRead(actorId, branchId, ['setup-list'], (client) =>
    listStaff(client, branchId, { limit: 50 }),
  );
  if (editing)
    return (
      <StaffForm
        actorId={actorId}
        branchId={branchId}
        payroll
        {...(editing === 'new' ? {} : { staff: editing })}
        close={() => setEditing(undefined)}
      />
    );
  return (
    <View style={s.list}>
      <View style={s.intro}>
        <View style={s.heading}>
          <Text accessibilityRole="header" className="font-heading" style={s.title}>
            Staff
          </Text>
          {list.data ? (
            <View style={s.count}>
              <UsersRound color={c.primary} size={18} />
              <Text className="font-heading" style={s.countText}>
                {list.data.data.length}
                {list.data.nextCursor ? '+' : ''} staff added
              </Text>
            </View>
          ) : null}
        </View>
        <View
          style={s.hero}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <UsersRound color={c.primary} size={32} />
        </View>
      </View>
      {list.error ? <Text style={{ color: c.dangerText }}>{safeMessage(list.error)}</Text> : null}
      {list.isPending ? <Skeleton kind="list" label="Loading staff…" /> : null}
      {(list.data?.data ?? []).map((staff) => (
        <StaffRow key={staff.id} staff={staff} edit={() => setEditing(staff)} />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add staff"
        onPress={() => setEditing('new')}
        style={s.add}
      >
        <UserPlus color={c.primary} size={20} />
        <Text className="font-heading" style={s.addText}>
          Add staff
        </Text>
      </Pressable>
    </View>
  );
}
