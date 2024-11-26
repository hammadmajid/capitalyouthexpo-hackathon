'use client';
import { useState } from 'react';
import { recordStaffPayment } from '@hsm/api-client';
import type { StaffSalary } from '@hsm/contracts';
import { karachiToday } from '../../lib/karachi-time';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { GroupedNumberInput } from '../ui/grouped-number-input';
import { Choice, methods, monthLabel, pkr, rupeesToPaisa, useStaffCommand } from './staff-shared';
type Method = keyof typeof methods;
// CHG-039: records a salary paid outside HSM (the platform never moves money). Totals come
// from the server's salary record; the same request key is kept while this form is open so a
// retry never pays twice.
export function StaffPayment(props: {
  actorId: string;
  branchId: string;
  staffName: string;
  salary: StaffSalary;
  close: () => void;
}) {
  const { salary } = props;
  const [amount, setAmount] = useState(String(Math.floor(salary.outstandingPaisa / 100)));
  const [paidOn, setPaidOn] = useState(() => karachiToday());
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
  const totals: [string, number][] = [
    ['Salary', salary.amountPaisa],
    ['Paid', salary.paidPaisa],
    ['Left', salary.outstandingPaisa],
  ];
  return (
    <section
      aria-label="Record salary"
      className="space-y-3 rounded-input border border-hsm-border p-4"
    >
      <h3 className="font-semibold">Record salary</h3>
      <p>
        {props.staffName} · {monthLabel(salary.month, 'long')}
      </p>
      <dl className="grid grid-cols-3 gap-2">
        {totals.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-hsm-secondary">{label}</dt>
            <dd className="font-bold">{pkr(value)}</dd>
          </div>
        ))}
      </dl>
      <label className="field-label">
        Amount paid, PKR
        <GroupedNumberInput className="field-input" value={amount} onValueChange={setAmount} />
      </label>
      <label className="field-label">
        Paid on
        <input
          className="field-input"
          type="date"
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
        />
      </label>
      <Choice label="Method" options={methods} value={method} onChange={setMethod} />
      <label className="field-label">
        Reference (optional)
        <input
          className="field-input"
          value={reference}
          maxLength={80}
          onChange={(event) => setReference(event.target.value)}
        />
      </label>
      <p className="text-xs text-hsm-secondary">
        HSM records this payment only; it does not send money.
      </p>
      {problem ? <p role="alert">{problem}</p> : null}
      {pay.isError ? <p role="alert">{errorMessage(pay.error)}</p> : null}
      {pay.unresolved && !pay.isPending ? (
        <Button onClick={() => pay.retryOriginal()}>Retry the same payment</Button>
      ) : (
        <Button disabled={pay.isPending} onClick={submit}>
          {pay.isPending ? 'Saving…' : 'Confirm payment'}
        </Button>
      )}
      <Button variant="secondary" onClick={props.close}>
        Cancel
      </Button>
    </section>
  );
}
