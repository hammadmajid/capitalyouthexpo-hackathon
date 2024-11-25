'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readPublicWaitlistOpen } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { WaitlistPreference } from './waitlist-preference';
import { useSession } from './providers';
import { authenticationPath, customerProfilePath } from '../lib/return-path';
import { errorMessage } from '../lib/messages';
import { useWaitlistCommand } from './use-waitlist-command';
import { Button } from './ui/button';
export function WaitlistJoin({ branchId, roomTypeId }: { branchId: string; roomTypeId?: string }) {
  const session = useSession(),
    returnTo = '/hostels/' + branchId;
  // CHG-040: a waiting list exists only once a resident has given notice; otherwise the option
  // is not offered at all (the server also refuses such a join).
  const open = useQuery({
    queryKey: ['waitlist-open', branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => readPublicWaitlistOpen(browserClient(), branchId),
  });
  if (!open.data?.open || (roomTypeId && !open.data.roomTypeIds.includes(roomTypeId))) return null;
  if (session.isPending) return <p role="status">Checking waiting-list access…</p>;
  if (session.error || !session.data)
    return (
      <Link className="text-link" href={authenticationPath('login', returnTo)}>
        Sign in to join the waiting list
      </Link>
    );
  if (!session.data.capabilities.customer)
    return (
      <Link className="text-link" href={customerProfilePath(returnTo)}>
        Complete your Customer profile to join the waiting list
      </Link>
    );
  return (
    <Join
      key={session.data.user.id + ':' + branchId + ':' + (roomTypeId ?? 'any')}
      actorId={session.data.user.id}
      branchId={branchId}
      {...(roomTypeId ? { roomTypeId } : {})}
    />
  );
}
function Join({
  actorId,
  branchId,
  roomTypeId,
}: {
  actorId: string;
  branchId: string;
  roomTypeId?: string;
}) {
  const { mutation, locked } = useWaitlistCommand(actorId);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const preferenceId = roomTypeId ?? selected?.id;
  return (
    <section aria-label="Hostel waiting list" className="space-y-3">
      <p>
        Waiting-list alerts do not reserve a bed or guarantee availability. No payment is taken.
      </p>
      {!roomTypeId ? (
        <>
          <p>Waiting-list preference: {selected?.name ?? 'Any room type'}</p>
          <WaitlistPreference
            branchId={branchId}
            disabled={locked}
            choose={(value) => {
              setSelected(value);
              mutation.reset();
            }}
          />
        </>
      ) : null}
      {mutation.isSuccess ? (
        <p role="status">You are on this waiting list. Manage it in your Customer space.</p>
      ) : (
        <Button
          disabled={locked}
          onClick={() =>
            mutation.mutate({
              kind: 'join',
              body: { branchId, ...(preferenceId ? { roomTypeId: preferenceId } : {}) },
            })
          }
        >
          {mutation.isPending ? 'Joining waiting list…' : 'Join waiting list'}
        </Button>
      )}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {locked && !mutation.isPending ? (
        <>
          <p>Confirmation is uncertain. Retry the original request.</p>
          <Button onClick={() => mutation.mutate(undefined)}>Retry waiting-list request</Button>
        </>
      ) : null}
    </section>
  );
}
