import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { readStaff, reverseStaffPayment } from '@hsm/api-client';
import type { StaffDetail as Detail } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { Skeleton } from '../loading/skeleton';
import { SetupButton } from '../owner-wizard-ui';
import { StaffAgreements } from './staff-agreements';
import { StaffPayment } from './staff-payment';
import {
  Chip,
  Field,
  Panel,
  SalaryChip,
  jobTitles,
  methods,
  pkr,
  useStaffCommand,
  useStaffRead,
} from './staff-shared';
const monthName = (month: string) =>
  new Date(month + 'T00:00:00Z').toLocaleDateString('en-PK', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
export function StaffDetailView(props: { actorId: string; branchId: string; staffId: string }) {
  const { actorId, branchId, staffId } = props;
  const detail = useStaffRead(actorId, branchId, ['detail', staffId], (client) =>
    readStaff(client, branchId, staffId),
  );
  const [mode, setMode] = useState<{ pay: string }>();
  if (!detail.data)
    return detail.isError ? (
      <Text style={{ color: c.dangerText }}>{safeMessage(detail.error)}</Text>
    ) : (
      <Skeleton kind="list" label="Loading staff…" />
    );
  const { staff, payroll } = detail.data;
  const close = () => setMode(undefined);
  const paying =
    typeof mode === 'object' ? detail.data.salaries.find((s) => s.id === mode.pay) : undefined;
  if (paying)
    return (
      <StaffPayment
        actorId={actorId}
        branchId={branchId}
        staffName={staff.fullName}
        salary={paying}
        close={close}
      />
    );
  return (
    <View style={{ gap: 12 }}>
      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.heading, fontSize: 20, fontWeight: '700' }}>
              {staff.fullName}
            </Text>
            <Text style={{ color: c.secondary }}>
              {staff.customTitle ?? jobTitles[staff.jobTitle]} · since {staff.startsOn}
              {staff.phone ? ' · 0' + staff.phone.slice(3) : ''}
            </Text>
          </View>
          <Chip
            label={
              staff.status === 'active' ? 'Active' : staff.status === 'ended' ? 'Ended' : 'Inactive'
            }
            color={staff.status === 'active' ? c.success : c.secondary}
          />
        </View>
      </Panel>
      {payroll ? (
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Wallet color={c.primary} size={20} />
            <Text style={{ flex: 1, color: c.heading, fontSize: 17, fontWeight: '700' }}>
              Salary
            </Text>
          </View>
          <Text style={{ color: c.text }}>
            {detail.data.terms[0]
              ? pkr(detail.data.terms[0].amountPaisa) +
                ' a month · paid on day ' +
                detail.data.terms[0].dueDay
              : 'No salary set yet'}
          </Text>
          {detail.data.salaries.map((salary) => (
            <View
              key={salary.id}
              style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.heading, fontWeight: '700' }}>
                  {monthName(salary.month)}
                </Text>
                <Text style={{ color: c.heading }}>{pkr(salary.amountPaisa)}</Text>
              </View>
              <SalaryChip salary={salary} />
              {salary.outstandingPaisa > 0 ? (
                <SetupButton
                  label={'Record payment · ' + pkr(salary.outstandingPaisa) + ' left'}
                  onPress={() => setMode({ pay: salary.id })}
                />
              ) : null}
            </View>
          ))}
          <Payments {...props} detail={detail.data} />
        </Panel>
      ) : null}
      <StaffAgreements actorId={actorId} branchId={branchId} detail={detail.data} />
    </View>
  );
}
type Props = { actorId: string; branchId: string; staffId: string };
function Payments(props: Props & { detail: Detail }) {
  const [reversing, setReversing] = useState<string>();
  const [reason, setReason] = useState('');
  const reverse = useStaffCommand<{ id: string; reason: string }>(
    'staff-reverse:' + props.staffId,
    props.actorId,
    props.branchId,
    (client, body, key) =>
      reverseStaffPayment(client, props.branchId, body.id, { reason: body.reason }, key),
  );
  if (!props.detail.payments.length) return null;
  return (
    <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border }}>
      <Text style={{ color: c.heading, fontWeight: '700' }}>Payments</Text>
      {props.detail.payments.map((p) => (
        <View key={p.id} style={{ gap: 4 }}>
          <Text style={{ color: p.kind === 'reversal' || p.reversed ? c.secondary : c.text }}>
            {p.kind === 'reversal' ? 'Reversed ' : ''}
            {pkr(p.amountPaisa)} · {methods[p.method]} · {p.paidOn}
            {p.reversed ? ' · reversed' : ''}
          </Text>
          {p.kind === 'payment' && !p.reversed ? (
            reversing === p.id ? (
              <View style={{ gap: 6 }}>
                <Field
                  label="Why reverse it?"
                  value={reason}
                  onChangeText={setReason}
                  maxLength={300}
                />
                <SetupButton
                  secondary
                  label="Reverse payment"
                  disabled={reverse.isPending}
                  onPress={() =>
                    reverse.mutate(
                      { id: p.id, reason: reason.trim() },
                      { onSuccess: () => setReversing(undefined) },
                    )
                  }
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Correct payment ' + pkr(p.amountPaisa)}
                onPress={() => setReversing(p.id)}
              >
                <Text style={{ color: c.primary, fontSize: 13 }}>Correct this</Text>
              </Pressable>
            )
          ) : null}
        </View>
      ))}
      {reverse.isError ? (
        <Text style={{ color: c.dangerText }}>{safeMessage(reverse.error)}</Text>
      ) : null}
    </View>
  );
}
