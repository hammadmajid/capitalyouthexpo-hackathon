'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBranchWaitlist, listOwnWaitlist } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { useWaitlistCommand } from './use-waitlist-command';
import { VacancyEstimates } from './vacancy-estimates';
type Props = { actorId: string; branchId?: string; accessUnavailable?: boolean };
export function Waitlist(props: Props) {
  return <Workspace key={props.actorId + ':' + (props.branchId ?? 'own')} {...props} />;
}
function Workspace({ actorId, branchId, accessUnavailable = false }: Props) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>();
  const { mutation, locked } = useWaitlistCommand(actorId);
  const query = useQuery({
    queryKey: ['waitlist', actorId, branchId ?? 'own', cursor],
    gcTime: 0,
    retry: false,
    enabled: open && !accessUnavailable,
    queryFn: () =>
      branchId
        ? listBranchWaitlist(browserClient(), branchId, cursor ? { cursor } : {})
        : listOwnWaitlist(browserClient(), cursor ? { cursor } : {}),
  });
  return (
    <section
      id={branchId ? undefined : 'waiting-list'}
      aria-label={branchId ? 'Hostel waiting list' : 'My waiting list'}
      className="space-y-3"
    >
      <Button variant="secondary" disabled={locked} onClick={() => setOpen(!open)}>
        {open ? 'Close waiting list' : branchId ? 'Manage waiting list' : 'My waiting list'}
      </Button>
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {branchId && open ? (
        <VacancyEstimates
          actorId={actorId}
          branchId={branchId}
          accessUnavailable={accessUnavailable || query.isError}
        />
      ) : null}
      {locked && !mutation.isPending ? (
        <Button disabled={accessUnavailable} onClick={() => mutation.mutate(undefined)}>
          Retry original leave request
        </Button>
      ) : null}
      {open ? (
        accessUnavailable || query.isError ? (
          <>
            <p role="alert">
