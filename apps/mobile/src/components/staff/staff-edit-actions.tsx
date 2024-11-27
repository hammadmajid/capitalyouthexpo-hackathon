import { useState } from 'react';
import { Text, View } from 'react-native';
import { PauseCircle, Pencil, UserMinus, UserRoundCheck, Wallet } from 'lucide-react-native';
import { readStaff } from '@hsm/api-client';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { Skeleton } from '../loading/skeleton';
import { IconChip } from '../inventory-tools';
import { PropertyActionDialog } from '../property-action-dialog';
import { StaffSalaryEditor } from './staff-salary-editor';
import { StaffStatusEditor, type StaffStatusAction } from './staff-status-editor';
import { pkr, useStaffRead } from './staff-shared';

// The setup edit form is the sole entry point for salary terms and employment changes.
export function StaffEditActions(props: {
  actorId: string;
  branchId: string;
  staffId: string;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'salary' | StaffStatusAction>();
  const detail = useStaffRead(props.actorId, props.branchId, ['detail', props.staffId], (client) =>
    readStaff(client, props.branchId, props.staffId),
  );
  if (!detail.data)
    return detail.isError ? (
      <Text accessibilityRole="alert" style={{ color: c.dangerText }}>
        {safeMessage(detail.error)}
      </Text>
    ) : (
      <Skeleton kind="inline" label="Loading staff settings" />
    );
  const data = detail.data,
    terms = data.terms[0],
    ended = data.staff.status === 'ended';
  return (
    <View style={{ gap: 12 }}>
      {data.payroll ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Wallet size={20} color={c.primary} />
          <View style={{ flex: 1 }}>
            <Text className="font-heading" style={{ color: c.heading }}>
              Monthly salary
            </Text>
            <Text style={{ color: c.text }}>{terms ? pkr(terms.amountPaisa) : 'Not set'}</Text>
          </View>
          {!ended ? (
            <IconChip Icon={Pencil} label="Edit salary" onPress={() => setAction('salary')} />
          ) : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {!ended ? (
          <>
            <IconChip
              Icon={data.staff.status === 'inactive' ? UserRoundCheck : PauseCircle}
              label={data.staff.status === 'inactive' ? 'Reactivate staff' : 'Suspend staff'}
              text={data.staff.status === 'inactive' ? 'Reactivate' : 'Suspend'}
              onPress={() =>
                setAction(data.staff.status === 'inactive' ? 'Reactivate staff' : 'Suspend staff')
              }
            />
            <IconChip
              Icon={UserMinus}
              label="Remove staff"
              text="Remove"
              onPress={() => setAction('Remove staff')}
            />
          </>
        ) : (
          <Text style={{ color: c.secondary }}>Removed · history retained</Text>
        )}
      </View>
      <PropertyActionDialog
        visible={Boolean(action)}
        title={action === 'salary' ? 'Salary' : (action ?? '')}
        busy={busy}
        close={() => {
          if (!busy) setAction(undefined);
        }}
      >
        {action === 'salary' && data.payroll && !ended ? (
          <StaffSalaryEditor
            {...props}
            onBusy={setBusy}
            detail={data}
            close={() => setAction(undefined)}
          />
        ) : null}
        {action && action !== 'salary' && !ended ? (
          <StaffStatusEditor
            {...props}
            onBusy={setBusy}
            staff={data.staff}
            action={action}
            close={props.close}
          />
        ) : null}
      </PropertyActionDialog>
    </View>
  );
}
