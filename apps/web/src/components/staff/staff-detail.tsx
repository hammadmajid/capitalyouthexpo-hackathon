'use client';
import { useState } from 'react';
import { readStaff, setStaffStatus } from '@hsm/api-client';
import type { StaffDetail } from '@hsm/contracts';
import { karachiToday } from '../../lib/karachi-time';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { StaffAgreements } from './staff-agreements';
import { StaffPayment } from './staff-payment';
import { StaffSalaryPanel } from './staff-salary';
import {
  Chip,
  jobTitles,
  localPhone,
  staffStatuses,
  useStaffCommand,
  useStaffRead,
} from './staff-shared';
type Props = { actorId: string; branchId: string; staffId: string };
export function StaffDetailView(props: Props) {
  const { actorId, branchId, staffId } = props;
  const detail = useStaffRead(actorId, branchId, ['detail', staffId], (client) =>
    readStaff(client, branchId, staffId),
  );
  const [ending, setEnding] = useState(false);
  const [paying, setPaying] = useState<string>();
  if (!detail.data)
    return detail.isError ? (
      <p role="alert">{errorMessage(detail.error)}</p>
    ) : (
      <p role="status">Loading staff…</p>
    );
  const data = detail.data,
    { staff } = data;
  const salary = paying ? data.salaries.find((row) => row.id === paying) : undefined;
  if (salary)
    return (
      <StaffPayment
        actorId={actorId}
        branchId={branchId}
        staffName={staff.fullName}
        salary={salary}
        close={() => setPaying(undefined)}
      />
    );
  return (
    <div className="space-y-3">
      <section
        aria-label={staff.fullName}
        className="space-y-2 rounded-input border border-hsm-border p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-lg font-bold text-hsm-heading">{staff.fullName}</h3>
          <Chip
            label={staffStatuses[staff.status]}
            tone={
              staff.status === 'active'
                ? 'border-hsm-success text-hsm-success'
                : 'border-hsm-border text-hsm-secondary'
            }
          />
        </div>
        <p className="text-hsm-secondary">
          {staff.customTitle ?? jobTitles[staff.jobTitle]} · since {staff.startsOn}
          {staff.phone ? ' · ' + localPhone(staff.phone) : ''}
        </p>
        {staff.status === 'active' && !ending ? (
          <Button variant="secondary" onClick={() => setEnding(true)}>
            Deactivate
          </Button>
        ) : null}
        {ending ? <EndStaff {...props} detail={data} close={() => setEnding(false)} /> : null}
        {staff.status !== 'active' ? <Reactivate {...props} detail={data} /> : null}
      </section>
      {data.payroll ? <StaffSalaryPanel {...props} detail={data} pay={setPaying} /> : null}
      <StaffAgreements actorId={actorId} branchId={branchId} detail={data} />
    </div>
  );
}
function EndStaff(props: Props & { detail: StaffDetail; close: () => void }) {
  const [reason, setReason] = useState('');
  const [endsOn, setEndsOn] = useState(() => karachiToday());
  const end = useStaffCommand<Record<string, unknown>>(
    'staff-end:' + props.staffId,
    props.actorId,
    props.branchId,
    (client, body, key) => setStaffStatus(client, props.branchId, props.staffId, body, key),
  );
  const send = (status: 'inactive' | 'ended') =>
    end.mutate(
      {
        expectedVersion: props.detail.staff.version,
        status,
        reason: reason.trim(),
        ...(status === 'ended' ? { endsOn } : {}),
      },
      { onSuccess: props.close },
    );
  return (
    <div className="space-y-2">
      <label className="field-label">
        Reason
        <input
          className="field-input"
          value={reason}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label className="field-label">
        Last working day (to end the job)
        <input
          className="field-input"
          type="date"
          value={endsOn}
          onChange={(event) => setEndsOn(event.target.value)}
        />
      </label>
      {end.isError ? <p role="alert">{errorMessage(end.error)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={end.isPending} onClick={() => send('ended')}>
          End job
        </Button>
        <Button variant="secondary" disabled={end.isPending} onClick={() => send('inactive')}>
          Pause (inactive)
        </Button>
        <Button variant="ghost" disabled={end.isPending} onClick={props.close}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-hsm-secondary">History and salary records are kept.</p>
    </div>
  );
}
function Reactivate(props: Props & { detail: StaffDetail }) {
  const on = useStaffCommand<Record<string, unknown>>(
    'staff-on:' + props.staffId,
    props.actorId,
    props.branchId,
    (client, body, key) => setStaffStatus(client, props.branchId, props.staffId, body, key),
  );
  return (
    <>
      {on.isError ? <p role="alert">{errorMessage(on.error)}</p> : null}
      <Button
        variant="secondary"
        disabled={on.isPending}
        onClick={() =>
          on.mutate({
            expectedVersion: props.detail.staff.version,
            status: 'active',
            reason: 'Back at work',
          })
        }
      >
        Make active again
      </Button>
    </>
  );
}
