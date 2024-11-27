import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { billingFormPaisa, billingFormRupees, setStaffSalaryTerms } from '@hsm/api-client';
import type { StaffDetail } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { DateField } from '../date-field';
import { SetupButton } from '../owner-wizard-ui';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Field, todayKarachi, useStaffCommand } from './staff-shared';

function effectiveMonth(detail: StaffDetail) {
  const current = todayKarachi().slice(0, 8) + '01';
  const last =
    [current, ...detail.terms.map((t) => t.effectiveFrom), ...detail.salaries.map((s) => s.month)]
      .sort()
      .at(-1) ?? current;
  if (!detail.terms.length && !detail.salaries.length)
    return [current, detail.staff.startsOn.slice(0, 8) + '01'].sort().at(-1) ?? current;
  const next = new Date(last + 'T00:00:00Z');
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 10);
}

export function StaffSalaryEditor(props: {
  actorId: string;
  branchId: string;
  detail: StaffDetail;
  close: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const terms = props.detail.terms[0];
  const [amount, setAmount] = useState(terms ? billingFormRupees(terms.amountPaisa) : '');
  const [dueDay, setDueDay] = useState(String(terms?.dueDay ?? 1));
  const [from, setFrom] = useState(() => effectiveMonth(props.detail));
  const [problem, setProblem] = useState<string>();
  const save = useStaffCommand<Record<string, unknown>>(
    'staff-terms:' + props.detail.staff.id,
    props.actorId,
    props.branchId,
    (client, body, key) =>
      setStaffSalaryTerms(client, props.branchId, props.detail.staff.id, body, key),
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
    try {
      const amountPaisa = billingFormPaisa(amount),
        day = Number(dueDay);
      if (amountPaisa <= 0) return setProblem('Enter a monthly salary greater than zero.');
      if (!Number.isInteger(day) || day < 1 || day > 28)
        return setProblem('Pay day must be 1 to 28.');
      setProblem(undefined);
      save.mutate({ amountPaisa, dueDay: day, effectiveFrom: from });
    } catch {
      setProblem('Enter the monthly salary in rupees.');
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Field
        label="Monthly salary, PKR"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        editable={!locked}
        maxLength={17}
      />
      <Field
        label="Pay day (1–28)"
        value={dueDay}
        onChangeText={setDueDay}
        keyboardType="number-pad"
        editable={!locked}
        maxLength={2}
      />
      <DateField
        label="Effective month"
        value={from}
        onChange={setFrom}
        monthOnly
        disabled={locked}
      />
      <Text style={{ color: c.secondary }}>Issued salaries stay unchanged.</Text>
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
        label={save.isPending ? 'Saving…' : 'Save salary'}
        disabled={locked}
        onPress={submit}
      />
    </View>
  );
}
