'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listBranchVisits,
  listOwnVisits,
  formatVisitStart,
  visitAvailableActions,
  visitStartFromLocal,
} from '@hsm/api-client';
import type { VisitCommand, VisitListEntry } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { useVisitCommand } from './use-visit-command';
import { Button } from './ui/button';
import { VisitingHours } from './visiting-hours';
import { VisitHistory } from './visit-history';
import { VisitInterest } from './visit-interest';
type Props = { actorId: string; branchId?: string; accessUnavailable?: boolean };
export function Visits(props: Props) {
  return <VisitWorkspace key={props.actorId + ':' + (props.branchId ?? 'own')} {...props} />;
}
function VisitWorkspace({ actorId, branchId, accessUnavailable = false }: Props) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>();
  const operation = useVisitCommand(actorId),
    { mutation, locked } = operation;
  const query = useQuery({
    queryKey: ['visits', actorId, branchId ?? 'own', cursor],
    gcTime: 0,
    retry: false,
    enabled: open && !accessUnavailable,
    queryFn: () =>
      branchId
        ? listBranchVisits(browserClient(), branchId, cursor ? { cursor } : {})
        : listOwnVisits(browserClient(), cursor ? { cursor } : {}),
  });
  return (
    <section
      id={branchId ? undefined : 'visits'}
      aria-label={branchId ? 'Hostel visits' : 'My visits'}
      className="space-y-4"
    >
      <Button variant="secondary" disabled={locked} onClick={() => setOpen((value) => !value)}>
        {open ? 'Close visits' : branchId ? 'Manage visits' : 'My visits'}
      </Button>
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {locked && !mutation.isPending ? (
        <>
          <p>Outcome unknown. The original request is retained.</p>
          <Button onClick={() => mutation.mutate(undefined)}>Retry original visit request</Button>
        </>
      ) : null}
      {mutation.isSuccess ? (
        <p role="status">Visit changes saved. Current details are refreshed from the hostel.</p>
      ) : null}
      {open && branchId ? (
        <VisitingHours
          operation={operation}
          actorId={actorId}
          branchId={branchId}
          accessUnavailable={accessUnavailable}
        />
      ) : null}
      {open ? (
        accessUnavailable || query.isError ? (
          <>
            <p role="alert">
              {accessUnavailable
                ? 'Refresh branch access before continuing.'
                : errorMessage(query.error)}
            </p>
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Refresh visit access
            </Button>
          </>
        ) : query.isPending || query.isFetching ? (
          <p role="status">Loading current visits…</p>
        ) : (
          <>
            {!query.data?.data.length ? <p>No visits on this page.</p> : null}
            {query.data?.data.map((visit) => (
              <VisitCard
                operation={operation}
                key={visit.id + ':' + visit.updatedAt}
                actorId={actorId}
                {...(branchId ? { branchId } : {})}
                visit={visit}
                management={Boolean(branchId)}
                locked={locked}
                submit={(command) =>
                  mutation.mutate({
                    kind: 'action',
                    visitId: visit.id,
                    branchId: branchId ?? null,
                    body: { expectedUpdatedAt: visit.updatedAt, command },
                  })
                }
              />
            ))}
            <Button
              variant="secondary"
              disabled={locked || !cursor}
              onClick={() => setCursor(undefined)}
            >
              First visits page
            </Button>
            <Button
              variant="secondary"
              disabled={locked || !query.data?.nextCursor}
              onClick={() => {
                if (query.data?.nextCursor) setCursor(query.data.nextCursor);
              }}
            >
              Next visits page
            </Button>
          </>
        )
      ) : null}
    </section>
  );
}
function VisitCard({
  operation,
  actorId,
  branchId,
  visit,
  management,
  locked,
  submit,
}: {
  operation: ReturnType<typeof useVisitCommand>;
  actorId: string;
  branchId?: string;
  visit: VisitListEntry;
  management: boolean;
  locked: boolean;
  submit: (command: VisitCommand) => void;
}) {
  const [action, setAction] = useState<VisitCommand['action']>(),
    [date, setDate] = useState(''),
    [time, setTime] = useState(''),
    [reason, setReason] = useState(''),
    [error, setError] = useState('');
  const actions = visitAvailableActions(visit, management, Date.now());
  function send() {
    if (!action) return;
    try {
      let command: VisitCommand;
      if (action === 'reschedule')
        command = {
          action,
          proposedStart: visitStartFromLocal(date, time),
          ...(reason.trim() ? { note: reason.trim() } : {}),
        };
      else if (action === 'reject') command = { action, reason };
      else command = { action };
      setError('');
      submit(command);
    } catch {
      setError('Enter a valid date and time in Asia/Karachi.');
    }
  }
  return (
    <article className="rounded-panel border border-hsm-border p-4 space-y-3">
      <h3>{management ? visit.customerName : visit.branchName}</h3>
      {management ? <p>{visit.branchName}</p> : null}
      <VisitHistory actorId={actorId} visitId={visit.id} {...(branchId ? { branchId } : {})} />
      {visit.status === 'completed' ? (
        <VisitInterest
          operation={operation}
          actorId={actorId}
          visitId={visit.id}
          {...(branchId ? { branchId } : {})}
        />
      ) : null}
      <p>{visit.status.replaceAll('_', ' ')}</p>
      <p>Requested: {formatVisitStart(visit.requestedStart)}</p>
      {visit.proposedStart ? (
        <p>Proposed: {formatVisitStart(visit.proposedStart)}. Your acceptance is required.</p>
      ) : null}
      {visit.reason ? <p>{visit.reason}</p> : null}
      {actions.length ? (
        <>
          <label className="field-label">
            Visit action
            <select
              className="field-input"
              value={action ?? ''}
              disabled={locked}
              onChange={(event) => {
                const selected = actions.find((value) => value === event.target.value);
                setAction(selected);
              }}
            >
              <option value="">Choose action</option>
              {actions.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('-', ' ')}
                </option>
              ))}
            </select>
          </label>
          {action === 'reschedule' ? (
            <>
              <label className="field-label">
                Proposed date
                <input
                  className="field-input"
                  type="date"
                  value={date}
                  disabled={locked}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="field-label">
                Proposed time (Asia/Karachi)
                <input
                  className="field-input"
                  type="time"
                  value={time}
                  disabled={locked}
                  onChange={(event) => setTime(event.target.value)}
                />
              </label>
            </>
          ) : null}
          {action === 'reject' || action === 'reschedule' ? (
            <label className="field-label">
              {action === 'reject' ? 'Rejection reason' : 'Optional note'}
              <input
                className="field-input"
                value={reason}
                maxLength={500}
                disabled={locked}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <Button
            disabled={locked || !action || (action === 'reject' && !reason.trim())}
            onClick={send}
          >
            Confirm visit action
          </Button>
        </>
      ) : null}
    </article>
  );
}
