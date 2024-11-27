import { StaffEditActions } from './staff-edit-actions';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { createStaff, updateStaff } from '@hsm/api-client';
import type { StaffMember } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { SetupButton } from '../owner-wizard-ui';
import { DateField } from '../date-field';
import {
  Choice,
  Field,
  Panel,
  jobTitles,
  rupeesToPaisa,
  todayKarachi,
  useStaffCommand,
} from './staff-shared';
type Title = keyof typeof jobTitles;
// Adding staff never creates a login; salary is optional and needs payroll access.
export function StaffForm(props: {
  actorId: string;
  branchId: string;
  staff?: StaffMember;
  payroll: boolean;
  close: () => void;
  onSaved?: (staff: StaffMember) => void;
}) {
  const { staff } = props;
  const [fullName, setName] = useState(staff?.fullName ?? '');
  const [phone, setPhone] = useState(staff?.phone ? '0' + staff.phone.slice(3) : '');
  const [jobTitle, setTitle] = useState<Title | undefined>(staff?.jobTitle);
  const [customTitle, setCustom] = useState(staff?.customTitle ?? '');
  const [startsOn, setStart] = useState(staff?.startsOn ?? todayKarachi());
  const [salary, setSalary] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [problem, setProblem] = useState<string>();
  const save = useStaffCommand<Record<string, unknown>>(
    staff ? 'staff-edit' : 'staff-add',
    props.actorId,
    props.branchId,
    (client, body, key) =>
      staff
        ? updateStaff(client, props.branchId, staff.id, body, key)
        : createStaff(client, props.branchId, body, key),
  );
  function submit() {
    if (!jobTitle) return setProblem('Choose a job title.');
    const amount = salary.trim() ? rupeesToPaisa(salary) : undefined;
    const day = Number(dueDay);
    if (salary.trim() && (!amount || amount <= 0))
      return setProblem('Enter the monthly salary in rupees.');
    if (amount && !(day >= 1 && day <= 28)) return setProblem('Salary day must be 1 to 28.');
    setProblem(undefined);
    const common = {
      fullName: fullName.trim(),
      jobTitle,
      ...(jobTitle === 'other' ? { customTitle: customTitle.trim() } : {}),
      startsOn,
    };
    const body = staff
      ? {
          ...common,
          expectedVersion: staff.version,
          phone: phone.trim() || null,
          ...(jobTitle === 'other' ? {} : { customTitle: null }),
        }
      : {
          ...common,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(amount
            ? {
                salary: {
                  amountPaisa: amount,
                  dueDay: day,
                  effectiveFrom: startsOn.slice(0, 8) + '01',
                },
              }
            : {}),
        };
    save.mutate(body, {
      onSuccess: (saved) => {
        props.onSaved?.(saved as StaffMember);
        props.close();
      },
    });
  }
  return (
    <Panel>
      <Text style={{ color: c.heading, fontSize: 18, fontWeight: '700' }}>
        {staff ? 'Edit staff' : 'Add staff'}
      </Text>
      <Field label="Full name" value={fullName} onChangeText={setName} maxLength={120} />
      <Field
        label="Mobile number (optional)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="03001234567"
        maxLength={13}
      />
      <Choice label="Job" options={jobTitles} value={jobTitle} onChange={setTitle} />
      {jobTitle === 'other' ? (
        <Field label="Job name" value={customTitle} onChangeText={setCustom} maxLength={60} />
      ) : null}
      <DateField label="Start date" value={startsOn} onChange={setStart} minYear={2000} />
      {!staff && props.payroll ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 2 }}>
            <Field
              label="Monthly salary, PKR (optional)"
              value={salary}
              onChangeText={setSalary}
              keyboardType="number-pad"
              placeholder="30000"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Pay day"
              value={dueDay}
              onChangeText={setDueDay}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
        </View>
      ) : null}
      {staff ? (
        <StaffEditActions
          actorId={props.actorId}
          branchId={props.branchId}
          staffId={staff.id}
          close={props.close}
        />
      ) : null}
      {problem ? <Text style={{ color: c.dangerText }}>{problem}</Text> : null}
      {save.isError ? <Text style={{ color: c.dangerText }}>{safeMessage(save.error)}</Text> : null}
      <SetupButton
        label={save.isPending ? 'Saving…' : 'Save'}
        disabled={save.isPending}
        onPress={submit}
      />
      <SetupButton secondary label="Cancel" onPress={props.close} />
    </Panel>
  );
}
