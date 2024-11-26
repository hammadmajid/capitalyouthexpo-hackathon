'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readInventoryAccess } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { HostelBookings } from '../hostel-bookings';
import { Button } from '../ui/button';
type Branch = { branchId: string; branchName: string };
export function DashboardBookingAction(props: {
  actorId: string;
  branches: Branch[];
  count: number;
}) {
  return (
    <BookingAction
      key={props.actorId + ':' + props.branches.map((b) => b.branchId).join(':')}
      {...props}
    />
  );
}
function BookingAction({
  actorId,
  branches,
  count,
}: {
  actorId: string;
  branches: Branch[];
  count: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-expanded={open}>
        Booking requests to decide: {count}
      </Button>
      {open ? (
        <section aria-label="Choose booking request branch">
          <p>
            Choose a branch to review its pending booking requests. Expired deadlines retain their
            existing display and cannot be approved.
          </p>
          {branches.map((branch) => (
            <BookingBranch key={branch.branchId} actorId={actorId} branch={branch} />
          ))}
          {!branches.length ? <p>No branches are available.</p> : null}
        </section>
      ) : null}
    </>
  );
}
function BookingBranch({ actorId, branch }: { actorId: string; branch: Branch }) {
  const [open, setOpen] = useState(false);
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branch.branchId],
    queryFn: () => readInventoryAccess(browserClient(), branch.branchId),
    gcTime: 0,
    retry: false,
  });
  if (access.isPending) return <p role="status">Checking booking queue access…</p>;
  if (access.error || !access.data.permissions.includes('booking_manage'))
    return <p>Booking queue access unavailable.</p>;
  return (
    <div hidden={access.isFetching}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {branch.branchName}
      </Button>
      {open ? (
        <HostelBookings actorId={actorId} branchId={branch.branchId} queue="pending_requests" />
      ) : null}
    </div>
  );
}
