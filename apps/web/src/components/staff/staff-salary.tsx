'use client';
import { useState } from 'react';
import { reverseStaffPayment, setStaffSalaryTerms } from '@hsm/api-client';
import type { StaffDetail } from '@hsm/contracts';
import { karachiToday } from '../../lib/karachi-time';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { GroupedNumberInput } from '../ui/grouped-number-input';
import {
  SalaryChip,
  methods,
  monthLabel,
  pkr,
  rupeesToPaisa,
  useStaffCommand,
} from './staff-shared';
type Props = { actorId: string; branchId: string; staffId: string };
// Payroll-only panel: current terms, issued months and payments (server sends payroll=true).
export function StaffSalaryPanel(
  props: Props & { detail: StaffDetail; pay: (id: string) => void },
) {
  const [changing, setChanging] = useState(false);
  const terms = props.detail.terms[0];
  return (
    <section aria-label="Salary" className="space-y-3 rounded-input border border-hsm-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex-1 font-semibold">Salary</h4>
        <Button variant="secondary" aria-expanded={changing} onClick={() => setChanging(!changing)}>
          Change salary
        </Button>
      </div>
      <p>
        {terms
          ? pkr(terms.amountPaisa) + ' a month · paid on day ' + terms.dueDay
          : 'No salary set yet'}
      </p>
      {changing ? <SalaryTerms {...props} close={() => setChanging(false)} /> : null}
      {props.detail.salaries.map((salary) => (
        <div key={salary.id} className="space-y-1 border-t border-hsm-border pt-2">
          <div className="flex justify-between">
            <span className="font-semibold">{monthLabel(salary.month)}</span>
            <span>{pkr(salary.amountPaisa)}</span>
          </div>
          <SalaryChip salary={salary} />
          {salary.outstandingPaisa > 0 ? (
            <Button onClick={() => props.pay(salary.id)}>
              {'Record payment · ' + pkr(salary.outstandingPaisa) + ' left'}
            </Button>
          ) : null}
        </div>
      ))}
      <Payments {...props} />
    </section>
  );
}
// First day of next month in Pakistan time: new terms never rewrite an issued month.
function nextMonthStart(today = karachiToday()) {
  const [year = 0, month = 0] = today.split('-').map(Number);
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  return String(next[0]) + '-' + String(next[1]).padStart(2, '0') + '-01';
}
function SalaryTerms(props: Props & { close: () => void }) {
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [from, setFrom] = useState(() => nextMonthStart().slice(0, 7));
  const [problem, setProblem] = useState<string>();
  const save = useStaffCommand<Record<string, unknown>>(
    'staff-terms:' + props.staffId,
    props.actorId,
    props.branchId,
    (client, body, key) => setStaffSalaryTerms(client, props.branchId, props.staffId, body, key),
  );
  function submit() {
    const paisa = rupeesToPaisa(amount);
    const day = Number(dueDay);
    if (!paisa) return setProblem('Enter the monthly salary in rupees.');
    if (!(day >= 1 && day <= 28)) return setProblem('Pay day must be 1 to 28.');
    if (!/^\d{4}-\d{2}$/.test(from)) return setProblem('Choose the starting month.');
    setProblem(undefined);
    save.mutate(
      { amountPaisa: paisa, dueDay: day, effectiveFrom: from + '-01' },
      { onSuccess: props.close },
    );
  }
  return (
    <div className="space-y-2">
      <label className="field-label">
        New monthly salary, PKR
        <GroupedNumberInput className="field-input" value={amount} onValueChange={setAmount} />
      </label>
      <label className="field-label">
        Pay day (1–28)
        <input
          className="field-input"
          inputMode="numeric"
          maxLength={2}
          value={dueDay}
          onChange={(event) => setDueDay(event.target.value)}
        />
      </label>
      <label className="field-label">
        Starts from month
        <input
          className="field-input"
          type="month"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </label>
      <p className="text-xs text-hsm-secondary">Months already issued keep their old amount.</p>
      {problem ? <p role="alert">{problem}</p> : null}
      {save.isError ? <p role="alert">{errorMessage(save.error)}</p> : null}
      <Button disabled={save.isPending} onClick={submit}>
        {save.isPending ? 'Saving…' : 'Save salary'}
      </Button>
    </div>
  );
}
function Payments(props: Props & { detail: StaffDetail }) {
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
    <div className="space-y-2 border-t border-hsm-border pt-2">
      <h4 className="font-semibold">Payments</h4>
      {props.detail.payments.map((p) => (
        <div key={p.id} className="space-y-1">
          <p className={p.kind === 'reversal' || p.reversed ? 'text-hsm-secondary' : ''}>
            {p.kind === 'reversal' ? 'Reversed ' : ''}
            {pkr(p.amountPaisa)} · {methods[p.method]} · {p.paidOn}
            {p.reversed ? ' · reversed' : ''}
          </p>
          {p.kind === 'payment' && !p.reversed ? (
            reversing === p.id ? (
              <div className="space-y-2">
                <label className="field-label">
                  Why reverse it?
                  <input
                    className="field-input"
                    value={reason}
                    maxLength={300}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <Button
                  variant="secondary"
                  disabled={reverse.isPending}
                  onClick={() =>
                    reverse.mutate(
                      { id: p.id, reason: reason.trim() },
                      { onSuccess: () => setReversing(undefined) },
                    )
                  }
                >
                  Reverse payment
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setReversing(p.id)}>
                {'Correct payment ' + pkr(p.amountPaisa)}
              </Button>
            )
          ) : null}
        </div>
      ))}
      {reverse.isError ? <p role="alert">{errorMessage(reverse.error)}</p> : null}
    </div>
  );
}
