'use client';
import { useState } from 'react';
import { listStaff, readStaffDashboard } from '@hsm/api-client';
import type { StaffMember } from '@hsm/contracts';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { StaffDetailView } from './staff-detail';
import { StaffForm } from './staff-form';
import { StaffList, StaffStats } from './staff-list';
import { staffStatuses, useStaffRead } from './staff-shared';
type Status = keyof typeof staffStatuses;
type Props = { actorId: string; branchId: string; canSetUp: boolean };
// CHG-039: the branch Staff tool for Owners and authorized Managers. Money appears only when
// the server says the viewer has payroll access. Mobile adds/edits staff in Hostel Setup
// (Owner only); web has no setup wizard yet, so the Owner adds/edits here (canSetUp).
export function StaffWorkspace({ actorId, branchId, canSetUp }: Props) {
  const [open, setOpen] = useState<string>();
  const [editing, setEditing] = useState<StaffMember | 'new'>();
  const [status, setStatus] = useState<Status>('active');
  const [q, setQ] = useState('');
  const query = q.trim();
  const dashboard = useStaffRead(actorId, branchId, ['dashboard'], (client) =>
    readStaffDashboard(client, branchId),
  );
  const list = useStaffRead(actorId, branchId, ['list', status, query], (client) =>
    listStaff(client, branchId, { status, ...(query ? { q: query } : {}), limit: 50 }),
  );
  if (editing)
    return (
      <StaffForm
        actorId={actorId}
        branchId={branchId}
        payroll={list.data?.payroll ?? false}
        {...(editing === 'new' ? {} : { staff: editing })}
        close={() => setEditing(undefined)}
      />
    );
  if (open)
    return (
      <section aria-label="Staff member" className="space-y-3">
        <Button variant="ghost" onClick={() => setOpen(undefined)}>
          ‹ Back to staff
        </Button>
        <StaffDetailView actorId={actorId} branchId={branchId} staffId={open} />
      </section>
    );
  const failure = dashboard.error ?? list.error;
  return (
    <section aria-label="Staff" className="space-y-3 rounded-input border border-hsm-border p-4">
      <h3 className="font-semibold">Staff</h3>
      <StaffStats dashboard={dashboard.data} />
      <label className="field-label">
        Search staff
        <input
          className="field-input"
          value={q}
          maxLength={80}
          placeholder="Name"
          onChange={(event) => setQ(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Staff status">
        {(Object.keys(staffStatuses) as Status[]).map((key) => (
          <Button
            key={key}
            variant={status === key ? 'primary' : 'secondary'}
            aria-pressed={status === key}
            onClick={() => setStatus(key)}
          >
            {staffStatuses[key]} staff
          </Button>
        ))}
      </div>
      {failure ? <p role="alert">{errorMessage(failure)}</p> : null}
      {list.isPending ? <p role="status">Loading staff…</p> : null}
      {list.data ? (
        <StaffList
          page={list.data}
          emptyLabel={'No ' + staffStatuses[status].toLowerCase() + ' staff yet.'}
          open={setOpen}
          {...(canSetUp ? { edit: setEditing } : {})}
        />
      ) : null}
      {canSetUp ? <Button onClick={() => setEditing('new')}>Add staff</Button> : null}
    </section>
  );
}
