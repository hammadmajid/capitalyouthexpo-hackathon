import { useState } from 'react';
import { Text, View } from 'react-native';
import { recordStaffPayment } from '@hsm/api-client';
import type { StaffSalary } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { SetupButton } from '../owner-wizard-ui';
import { DateField } from '../date-field';
import {
  Choice,
  Field,
  Panel,
  methods,
  pkr,
  rupeesToPaisa,
  todayKarachi,
  useStaffCommand,
} from './staff-shared';
type Method = keyof typeof methods;
// CHG-039: records a salary paid outside HSM. Totals come from the server's salary record;
// the same request key is kept while this form is open so a retry never pays twice.
export function StaffPayment(props: {
  actorId: string;
  branchId: string;
  staffName: string;
  salary: StaffSalary;
  close: () => void;
}) {
  const { salary } = props;
  const [amount, setAmount] = useState(String(salary.outstandingPaisa / 100));
  const [paidOn, setPaidOn] = useState(todayKarachi());
  const [method, setMethod] = useState<Method>('cash');
  const [reference, setReference] = useState('');
  const [problem, setProblem] = useState<string>();
  const pay = useStaffCommand<Record<string, unknown>>(
    'staff-pay:' + salary.id,
    props.actorId,
    props.branchId,
    (client, body, key) => recordStaffPayment(client, props.branchId, salary.id, body, key),
  );
  function submit() {
    const paisa = rupeesToPaisa(amount);
    if (!paisa) return setProblem('Enter the amount in rupees.');
    if (paisa > salary.outstandingPaisa)
      return setProblem('That is more than the ' + pkr(salary.outstandingPaisa) + ' still owed.');
    setProblem(undefined);
    pay.mutate(
      {
        amountPaisa: paisa,
        paidOn,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      },
      { onSuccess: props.close },
    );
  }
  const month = new Date(salary.month + 'T00:00:00Z').toLocaleDateString('en-PK', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <Panel>
      <Text style={{ color: c.heading, fontSize: 18, fontWeight: '700' }}>Record salary</Text>
      <Text style={{ color: c.text }}>
        {props.staffName} · {month}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[
          ['Salary', salary.amountPaisa],
          ['Paid', salary.paidPaisa],
          ['Left', salary.outstandingPaisa],
        ].map(([label, value]) => (
          <View key={label as string}>
            <Text style={{ color: c.secondary, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: c.heading, fontWeight: '700' }}>{pkr(value as number)}</Text>
          </View>
        ))}
      </View>
      <Field
        label="Amount paid, PKR"
        value={amount}
        onChangeText={setAmount}
        keyboardType="number-pad"
      />
      <DateField label="Paid on" value={paidOn} onChange={setPaidOn} />
      <Choice label="Method" options={methods} value={method} onChange={setMethod} />
      <Field
        label="Reference (optional)"
        value={reference}
        onChangeText={setReference}
        maxLength={80}
      />
      <Text style={{ color: c.secondary, fontSize: 12 }}>
        HSM records this payment only; it does not send money.
      </Text>
      {problem ? <Text style={{ color: c.dangerText }}>{problem}</Text> : null}
      {pay.isError ? <Text style={{ color: c.dangerText }}>{safeMessage(pay.error)}</Text> : null}
      {pay.unresolved && !pay.isPending ? (
        <SetupButton label="Retry the same payment" onPress={() => pay.retryOriginal()} />
      ) : (
        <SetupButton
          label={pay.isPending ? 'Saving…' : 'Confirm payment'}
          disabled={pay.isPending}
          onPress={submit}
        />
      )}
      <SetupButton secondary label="Cancel" onPress={props.close} />
    </Panel>
  );
}
