'use client';
import type { StaffDashboard, StaffMember } from '@hsm/contracts';
import { Button } from '../ui/button';
import { Chip, SalaryChip, jobTitles, methods, pkr, staffStatuses } from './staff-shared';
export function StaffStats({ dashboard }: { dashboard: StaffDashboard | undefined }) {
  const payroll = dashboard?.payroll ?? null;
  const stats: [string, string][] = [['Active staff', String(dashboard?.activeStaff ?? '–')]];
  if (payroll)
    stats.push(
      ['Paid', String(payroll.paid)],
      ['Due today', String(payroll.due)],
      ['Overdue', String(payroll.overdue)],
      ['Left to pay', pkr(payroll.outstandingPaisa)],
    );
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-input border border-hsm-border bg-hsm-icy p-3">
            <dt className="text-xs text-hsm-secondary">{label}</dt>
            <dd className="text-lg font-bold text-hsm-heading">{value}</dd>
          </div>
        ))}
      </dl>
      {payroll?.needsAmount ? (
        <p role="status">
          {payroll.needsAmount} part-month salary needs an amount — open the staff member.
        </p>
      ) : null}
      {payroll?.recentPayments.length ? (
        <div>
          <h4 className="font-semibold">Recent payments</h4>
          <ul>
            {payroll.recentPayments.map((p) => (
              <li key={p.id}>
                {p.staffName} · {p.kind === 'reversal' ? '−' : ''}
                {pkr(p.amountPaisa)} · {methods[p.method]} · {p.paidOn}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
export function StaffList(props: {
  page: { data: StaffMember[] };
  emptyLabel: string;
  open: (id: string) => void;
  edit?: (staff: StaffMember) => void;
}) {
  if (!props.page.data.length) return <p>{props.emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {props.page.data.map((member) => (
        <li key={member.id} className="space-y-1 rounded-input border border-hsm-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 font-semibold text-hsm-heading">{member.fullName}</span>
            {member.salary ? <span>{pkr(member.salary.amountPaisa)}</span> : null}
          </div>
          <p className="text-hsm-secondary">{member.customTitle ?? jobTitles[member.jobTitle]}</p>
          {member.salary ? (
            <SalaryChip salary={member.salary} />
          ) : member.status !== 'active' ? (
            <Chip
              label={staffStatuses[member.status]}
              tone="border-hsm-border text-hsm-secondary"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => props.open(member.id)}>
              Open {member.fullName}
            </Button>
            {props.edit ? (
              <Button variant="ghost" onClick={() => props.edit?.(member)}>
                Edit {member.fullName}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
