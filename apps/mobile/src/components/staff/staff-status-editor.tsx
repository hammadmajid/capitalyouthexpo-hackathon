import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { setStaffStatus } from '@hsm/api-client';
import type { StaffMember } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { DateField } from '../date-field';
import { SetupButton } from '../owner-wizard-ui';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Field, todayKarachi, useStaffCommand } from './staff-shared';

export type StaffStatusAction = 'Suspend staff' | 'Reactivate staff' | 'Remove staff';
export function StaffStatusEditor(props: {
  actorId: string;
  branchId: string;
  staff: StaffMember;
  action: StaffStatusAction;
  close: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [endsOn, setEndsOn] = useState(
    () => [todayKarachi(), props.staff.startsOn].sort().at(-1) ?? todayKarachi(),
  );
  const [problem, setProblem] = useState<string>();
  const status =
    props.action === 'Suspend staff'
      ? 'inactive'
      : props.action === 'Remove staff'
        ? 'ended'
        : 'active';
  const save = useStaffCommand<Record<string, unknown>>(
    'staff-status:' + props.staff.id,
    props.actorId,
    props.branchId,
    (client, body, key) => setStaffStatus(client, props.branchId, props.staff.id, body, key),
  );
  const locked = save.isPending || save.unresolved;
  useEffect(() => {
    props.onBusy(save.isPending);
    return () => props.onBusy(false);
  }, [save.isPending, props.onBusy]);
  useEffect(() => {
    if (save.isSuccess) props.close();
  }, [save.isSuccess, props.close]);
  function submit() {
    if (reason.trim().length < 3) return setProblem('Enter a short reason.');
    if (status === 'ended' && endsOn < props.staff.startsOn)
      return setProblem('Last working day is before the start date.');
    setProblem(undefined);
    save.mutate({
      expectedVersion: props.staff.version,
      status,
      reason: reason.trim(),
      ...(status === 'ended' ? { endsOn } : {}),
    });
  }
  return (
    <View style={{ gap: 12 }}>
      {status === 'ended' ? (
        <Text style={{ color: c.secondary }}>
          Removes from active staff. Salary and payment history is kept.
        </Text>
      ) : null}
      <Field
        label="Reason"
        value={reason}
        onChangeText={setReason}
        maxLength={300}
        editable={!locked}
      />
      {status === 'ended' ? (
        <DateField label="Last working day" value={endsOn} onChange={setEndsOn} disabled={locked} />
      ) : null}
      <NativeCommandRecovery command={save} />
      {problem ? (
        <Text accessibilityRole="alert" style={{ color: c.dangerText }}>
          {problem}
        </Text>
      ) : null}
      {save.isError ? (
        <Text accessibilityRole="alert" style={{ color: c.dangerText }}>
          {safeMessage(save.error)}
        </Text>
      ) : null}
      <SetupButton
        Icon={Check}
        label={'Confirm ' + props.action.toLowerCase()}
        disabled={locked}
        onPress={submit}
      />
    </View>
  );
}
