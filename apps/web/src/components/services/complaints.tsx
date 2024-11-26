'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { complaintCategorySchema, type Complaint } from '@hsm/contracts';
import {
  createComplaint,
  readBranchComplaint,
  readBranchComplaints,
  readComplaintStats,
  readOwnComplaint,
  readOwnComplaints,
  residentComplaintAction,
  staffComplaintAction,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { PrivateFileInput } from '../private-file-input';
import { Button } from '../ui/button';
import { useCommand } from './use-command';
import { CommandRecovery } from './command-recovery';
export const complaintLabel: Record<Complaint['status'], string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved — waiting for your confirmation',
  reopened: 'Reopened',
  closed: 'Closed',
};
function History({
  events,
}: {
  events: {
    id: string;
    actorName: string;
    toStatus: Complaint['status'];
    note: string | null;
    createdAt: string;
  }[];
}) {
  return (
    <ol aria-label="Complaint history">
      {events.map((event) => (
        <li key={event.id}>
          {event.createdAt.slice(0, 10)} · {event.actorName}: {complaintLabel[event.toStatus]}
          {event.note ? ' — ' + event.note : ''}
        </li>
      ))}
    </ol>
  );
}
// CMP-001..006: resident complaints on the own active Stay; accept or reopen a resolution.
export function StayComplaints({
  actorId,
  stayId,
  closed,
}: {
  actorId: string;
  stayId: string;
  closed: boolean;
}) {
  const listKey = ['own-complaints', actorId, stayId];
  const list = useQuery({
    queryKey: listKey,
    gcTime: 0,
    retry: false,
    queryFn: () => readOwnComplaints(browserClient(), stayId),
  });
  const [open, setOpen] = useState<string>();
  const detail = useQuery({
    queryKey: ['own-complaint', actorId, stayId, open],
    enabled: Boolean(open),
    gcTime: 0,
    queryFn: () => readOwnComplaint(browserClient(), stayId, open),
  });
  const [form, setForm] = useState({ category: 'other', title: '', description: '', note: '' });
  const [fileId, setFileId] = useState<string>(),
    [busy, setBusy] = useState(false);
  const create = useCommand(
    'StayComplaints:create',
    (body: Record<string, unknown>, key) => createComplaint(browserClient(), stayId, body, key),
    [listKey],
  );
  const act = useCommand(
    'StayComplaints:act',
    (body: { id: string; input: Record<string, unknown> }, key) =>
      residentComplaintAction(browserClient(), stayId, body.id, body.input, key),
    [listKey, ['own-complaint', actorId, stayId]],
  );
  return (
    <section aria-label="Complaints" className="space-y-2">
      <CommandRecovery command={create} />
      <CommandRecovery command={act} />
      <h4 className="font-semibold">Complaints</h4>
      {create.isError || act.isError ? (
        <p role="alert">{errorMessage(create.error ?? act.error)}</p>
      ) : null}
      {create.isSuccess ? <p role="status">Complaint sent to the hostel.</p> : null}
      {list.data?.data.length === 0 ? <p>No complaints yet.</p> : null}
      {list.data?.data.map((row) => (
        <Button key={row.id} variant="ghost" onClick={() => setOpen(row.id)}>
          {row.title}: {complaintLabel[row.status]}
        </Button>
      ))}
      {detail.data ? (
        <div className="space-y-1">
          <p>{detail.data.description}</p>
          <History events={detail.data.events} />
          {detail.data.status === 'resolved' ? (
            <>
              <Button
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({
                    id: detail.data.id,
                    input: { action: 'accept', expectedVersion: detail.data.version },
                  })
                }
              >
                Confirm it is fixed
              </Button>
              {!closed ? (
                <>
                  <input
                    aria-label="Why it is not fixed"
                    className="field-input"
                    maxLength={2000}
                    value={form.note}
                    onChange={(event) => setForm({ ...form, note: event.target.value })}
                  />
                  <Button
                    variant="secondary"
                    disabled={!form.note.trim() || act.isPending}
                    onClick={() =>
                      act.mutate({
                        id: detail.data.id,
                        input: {
                          action: 'reopen',
                          expectedVersion: detail.data.version,
                          note: form.note.trim(),
                        },
                      })
                    }
                  >
                    Reopen complaint
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {closed ? (
        <p>New complaints cannot be raised for a past Stay.</p>
      ) : (
        <div className="space-y-1">
          <select
            aria-label="Complaint category"
            className="field-input"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
          >
            {complaintCategorySchema.options.map((category) => (
              <option key={category} value={category}>
                {category.replace('_', ' ')}
              </option>
            ))}
          </select>
          <input
            aria-label="Complaint title"
            className="field-input"
            maxLength={120}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
          <textarea
            aria-label="Describe the problem"
            className="field-input"
            maxLength={2000}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <PrivateFileInput
            id={'complaint-' + stayId}
            label="Photo or document (optional)"
            purpose="complaint_attachment"
            disabled={create.isPending}
            onReady={setFileId}
            onBusy={setBusy}
          />
          <Button
            disabled={!form.title.trim() || !form.description.trim() || busy || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  category: form.category,
                  title: form.title.trim(),
                  description: form.description.trim(),
                  attachmentFileIds: fileId ? [fileId] : [],
                },
                {
                  onSuccess: () =>
                    setForm({ category: 'other', title: '', description: '', note: '' }),
                },
              )
            }
          >
            Send complaint
          </Button>
        </div>
      )}
    </section>
  );
}
// CMP-005: staff queue, detail with history, and the allowed next steps.
export function BranchComplaints({
  actorId,
  branchId,
  staffUserId,
  complaintId,
  onLockChange,
}: {
  actorId: string;
  branchId: string;
  staffUserId: string;
  complaintId?: string;
  onLockChange?: (locked: boolean) => void;
}) {
  const listKey = ['branch-complaints', actorId, branchId];
  const list = useQuery({
    enabled: complaintId === undefined,
    queryKey: listKey,
    gcTime: 0,
    retry: false,
    queryFn: () => readBranchComplaints(browserClient(), branchId),
  });
  const stats = useQuery({
    enabled: complaintId === undefined,
    queryKey: ['complaint-stats', actorId, branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => readComplaintStats(browserClient(), branchId),
  });
  const [open, setOpen] = useState<string | undefined>(complaintId),
    [note, setNote] = useState('');
  const detail = useQuery({
    queryKey: ['branch-complaint', actorId, branchId, open],
    enabled: Boolean(open),
    gcTime: 0,
    queryFn: () => readBranchComplaint(browserClient(), branchId, open),
  });
  const act = useCommand(
    'BranchComplaints:act',
    (body: { id: string; input: Record<string, unknown> }, key) =>
      staffComplaintAction(browserClient(), branchId, body.id, body.input, key),
    [
      listKey,
      ['branch-complaint', actorId, branchId],
      ['complaint-stats', actorId, branchId],
      ['dashboard-queue', actorId, branchId],
      ['owner-dashboard', actorId],
      ['branch-dashboard', actorId, branchId],
    ],
  );
  useEffect(() => {
    onLockChange?.(act.isPending || act.unresolved);
    return () => onLockChange?.(false);
  }, [onLockChange, act.isPending, act.unresolved]);
  const d = detail.isError ? undefined : detail.data;
  return (
    <section aria-label="Complaint queue" className="space-y-2">
      <CommandRecovery command={act} />
      <h3 className="font-semibold">Complaints</h3>
      {!complaintId && stats.data ? (
        <p>
          Open {stats.data.counts.open} · In progress {stats.data.counts.in_progress} · Reopened{' '}
          {stats.data.counts.reopened} · Resolved {stats.data.counts.resolved} · Average resolution{' '}
          {stats.data.averageResolutionHours === null
            ? 'not yet measured'
            : stats.data.averageResolutionHours + ' hours'}
        </p>
      ) : null}
      {act.isError ? <p role="alert">{errorMessage(act.error)}</p> : null}
      {detail.isError ? <p role="alert">{errorMessage(detail.error)}</p> : null}
      {!complaintId &&
        list.data?.data.map((row) => (
          <Button key={row.id} variant="ghost" onClick={() => setOpen(row.id)}>
            {row.residentName} · {row.title}: {complaintLabel[row.status]}
          </Button>
        ))}
      {d ? (
        <div className="space-y-1">
          <p>
            {d.category} · {d.roomLabel ?? ''} {d.bedLabel ?? ''} · {d.description}
          </p>
          <History events={d.events} />
          <input
            aria-label="Complaint note"
            className="field-input"
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {['open', 'reopened', 'assigned', 'in_progress'].includes(d.status) ? (
            <>
              <Button
                variant="secondary"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({
                    id: d.id,
                    input: {
                      action: 'assign',
                      expectedVersion: d.version,
                      assigneeUserId: staffUserId,
                    },
                  })
                }
              >
                Assign to me
              </Button>
              {d.status !== 'in_progress' ? (
                <Button
                  variant="secondary"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({ id: d.id, input: { action: 'start', expectedVersion: d.version } })
                  }
                >
                  Start work
                </Button>
              ) : null}
              <Button
                disabled={!note.trim() || act.isPending}
                onClick={() =>
                  act.mutate(
                    {
                      id: d.id,
                      input: { action: 'resolve', expectedVersion: d.version, note: note.trim() },
                    },
                    { onSuccess: () => setNote('') },
                  )
                }
              >
                Mark resolved
              </Button>
            </>
          ) : null}
          {d.status === 'resolved' ? <p>Waiting for the resident to confirm or reopen.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
