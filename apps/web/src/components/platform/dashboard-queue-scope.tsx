'use client';
import { useQuery } from '@tanstack/react-query';
import { readInventoryAccess } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import type { DashboardNavigationQueue } from '../../lib/dashboard-queue-path';
import { queuePermission } from './dashboard-queue-config';
import { PaymentReview } from '../payment-review';
import { HostelBookings } from '../hostel-bookings';
import { DashboardOperationalQueue } from './dashboard-operational-queue';
import { Button } from '../ui/button';
export function DashboardQueueScope(props: {
  actorId: string;
  branchId: string;
  queue: DashboardNavigationQueue;
}) {
  return <Scope key={props.actorId + ':' + props.branchId + ':' + props.queue} {...props} />;
}
function Scope({
  actorId,
  branchId,
  queue,
}: {
  actorId: string;
  branchId: string;
  queue: DashboardNavigationQueue;
}) {
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    queryFn: () => readInventoryAccess(browserClient(), branchId),
    gcTime: 0,
    retry: false,
  });
  if (access.isPending) return <p role="status">Checking queue access…</p>;
  if (access.error || !access.data.permissions.includes(queuePermission(queue)))
    return (
      <section>
        <p role="alert">
          {access.error ? errorMessage(access.error) : 'Queue access unavailable.'}
        </p>
        <Button onClick={() => void access.refetch()}>Retry queue access</Button>
      </section>
    );
  return (
    <fieldset className="min-w-0 space-y-3" hidden={access.isFetching} disabled={access.isFetching}>
      {queue === 'bookings' ? (
        <HostelBookings actorId={actorId} branchId={branchId} queue="pending_requests" />
      ) : queue === 'proofs' ? (
        <PaymentReview actorId={actorId} branchId={branchId} initialOpen />
      ) : (
        <DashboardOperationalQueue
          actorId={actorId}
          branchId={branchId}
          queue={queue}
          permissions={access.data.permissions}
        />
      )}
    </fieldset>
  );
}
