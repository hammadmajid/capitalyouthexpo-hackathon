'use client';
import { useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listHostelBookings,
  transitionHostelBooking,
  approveUpfrontBooking,
  readInventoryAccess,
  marketplacePrice,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { refreshBookingViews } from '../lib/dashboard-refresh';
import { inventoryScopeDenied } from './use-branch-inventory';
import { Button } from './ui/button';
import { BookingUpfrontReview } from './booking-upfront-review';
import { BookingCheckIn } from './booking-check-in';
type Action = 'confirm' | 'approve' | 'reject' | 'cancel';
const actionNames: Record<Action, string> = {
  confirm: 'confirmation',
  approve: 'approval',
  reject: 'rejection',
  cancel: 'cancellation',
};
type Props = { actorId: string; branchId: string; queue?: 'pending_requests' };
export function HostelBookings(props: Props) {
  return (
    <BranchBookingQueue
      key={props.actorId + ':' + props.branchId + ':' + (props.queue ?? 'all')}
      {...props}
    />
  );
}
function BranchBookingQueue({ actorId, branchId, queue }: Props) {
  const cache = useQueryClient(),
    queryKey = ['hostel-bookings', actorId, branchId, ...(queue ? [queue] : [])];
  const keys = useRef(new Map<string, string>());
  const [selection, setSelection] = useState<{ id: string; action: Action }>();
  const [reason, setReason] = useState('');
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const query = useInfiniteQuery({
    queryKey,
    gcTime: 0,
    initialPageParam: null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listHostelBookings(browserClient(), branchId, {
        limit: 20,
        ...(queue ? { queue } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
  const action = useMutation({
    gcTime: 0,
    mutationFn: (input: { id: string; action: Action; reason: string }) => {
      const command = JSON.stringify(input);
      let key = keys.current.get(command);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(command, key);
      }
      // SRS v2.11: upfront requests are approved for payment, never confirmed directly.
      if (input.action === 'approve')
        return approveUpfrontBooking(browserClient(), branchId, input.id, input.reason, key);
      return transitionHostelBooking(
        browserClient(),
        branchId,
        input.id,
        input.action,
        input.reason,
        key,
      );
    },
    onError: async () => {
      await cache.invalidateQueries({
        queryKey: ['inventory-access', actorId, branchId],
        exact: true,
      });
    },
    onSuccess: async (_response, input) => {
      keys.current.delete(JSON.stringify(input));
      setSelection(undefined);
      setReason('');
      await Promise.all([
        refreshBookingViews(cache, actorId, branchId),
        cache.invalidateQueries({
          queryKey: ['owner-document-review', actorId, branchId],
          exact: true,
        }),
      ]);
    },
  });
  if (query.isPending) return <p role="status">Loading branch bookings...</p>;
  if (query.isError)
    return (
      <section className="space-y-3">
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry branch bookings
        </Button>
      </section>
    );
  if (inventoryScopeDenied(access.error))
    return (
      <section className="space-y-3">
        <p role="alert">{errorMessage(access.error)}</p>
        <Button variant="secondary" onClick={() => void access.refetch()}>
          Retry booking permissions
        </Button>
      </section>
    );
  const rows = query.data.pages.flatMap((page) => page.data);
  const canManage =
    !access.isError &&
    !access.isFetching &&
    (access.data?.permissions.includes('booking_manage') ?? false);
  // CHG-010: check-in creates a Stay and its terms, so it needs stay, rent and finance grants.
  const canCheckIn =
    !access.isError &&
    !access.isFetching &&
    (['stay_manage', 'rent_manage', 'finance_view'] as const).every(
      (permission) => access.data?.permissions.includes(permission) ?? false,
    );
  const canReview =
    canManage &&
    (['payment_record', 'finance_view'] as const).every(
      (permission) => access.data?.permissions.includes(permission) ?? false,
    );
  return (
    <section className="space-y-4" aria-label="Branch bookings">
      <h2 className="font-heading text-xl">Branch bookings</h2>
      {access.isError ? (
        <div>
          <p role="alert">{errorMessage(access.error)}</p>
          <Button variant="secondary" onClick={() => void access.refetch()}>
            Retry booking permissions
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? <p>No bookings are available for this branch.</p> : null}
      {action.isError ? <p role="alert">{errorMessage(action.error)}</p> : null}
      {rows.map((booking) => (
        <article key={booking.id} className="rounded-panel border border-hsm-border p-4 space-y-2">
          <h3 className="font-heading">{booking.reference}</h3>
          <p>
            {booking.quote.listing.roomLabel}
            {booking.quote.listing.bedLabel ? ', bed ' + booking.quote.listing.bedLabel : ''}
          </p>
          <p>Status: {booking.state.replaceAll('_', ' ')}</p>
          <p>
            {booking.quote.range.moveInDate} to {booking.quote.range.moveOutDate}
          </p>
          <p>Quoted monthly rent: {marketplacePrice(booking.quote.price.monthlyRentPaisa)}</p>
          <p>Quoted deposit: {marketplacePrice(booking.quote.price.depositPaisa)}</p>
          {booking.quote.price.fees.map((fee) => (
            <p key={fee.code + ':' + fee.cadence}>
              {fee.code.replaceAll('_', ' ')}: {marketplacePrice(fee.amountPaisa)} (
              {fee.cadence === 'monthly' ? 'monthly' : 'one time'})
            </p>
          ))}
          <p>
            {booking.quote.policy.cancellationAllowed
              ? 'Customer cancellation cutoff: ' +
                booking.quote.policy.cancellationCutoffHours +
                ' hours before move in'
              : 'Customer cancellation is not permitted by the quoted policy.'}
          </p>
          {booking.requestExpiresAt ? <p>Request deadline: {booking.requestExpiresAt}</p> : null}
          {booking.documents.map((document) => (
            <p key={document.kind}>
              {document.kind.replaceAll('_', ' ')}: {document.state}
            </p>
          ))}
          {booking.stay ? (
            <p role="status">
              Checked in. Stay {booking.stay.state.replaceAll('_', ' ')}: {booking.stay.id}
            </p>
          ) : null}
          {!booking.stay && canCheckIn && booking.state === 'confirmed' ? (
            <BookingCheckIn actorId={actorId} branchId={branchId} bookingId={booking.id} />
          ) : null}
          {booking.upfront ? (
            <BookingUpfrontReview
              actorId={actorId}
              branchId={branchId}
              bookingId={booking.id}
              upfront={booking.upfront}
              canReview={canReview && booking.state === 'pending_request'}
            />
          ) : null}
          {canManage && (booking.state === 'pending_request' || booking.state === 'confirmed') ? (
            selection?.id === booking.id ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canManage && selection && reason.trim() && !action.isPending)
                    action.mutate({ ...selection, reason: reason.trim() });
                }}
              >
                <label className="field-label" htmlFor={'booking-reason-' + booking.id}>
                  Reason for {actionNames[selection.action]}
                </label>
                <textarea
                  className="field-input"
                  id={'booking-reason-' + booking.id}
                  value={reason}
                  maxLength={500}
                  required
                  disabled={action.isPending}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button type="submit" disabled={!reason.trim() || action.isPending}>
                  {action.isPending
                    ? 'Saving booking...'
                    : 'Submit ' + actionNames[selection.action]}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() => setSelection(undefined)}
                >
                  Keep booking unchanged
                </Button>
              </form>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {(booking.state !== 'pending_request'
                  ? (['cancel'] as const)
                  : !booking.upfront
                    ? (['confirm', 'reject', 'cancel'] as const)
                    : booking.upfront.status === 'awaiting_approval'
                      ? (['approve', 'reject', 'cancel'] as const)
                      : (['reject', 'cancel'] as const)
                ).map((next) => (
                  <Button
                    key={next}
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() => {
                      setSelection({ id: booking.id, action: next });
                      setReason('');
                      action.reset();
                    }}
                  >
                    {next === 'confirm'
                      ? 'Confirm request'
                      : next === 'approve'
                        ? 'Approve and request payment'
                        : next === 'reject'
                          ? 'Reject request'
                          : 'Cancel booking'}
                  </Button>
                ))}
              </div>
            )
          ) : null}
        </article>
      ))}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading bookings...' : 'Load more branch bookings'}
        </Button>
      ) : null}
      <Button variant="ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Refresh branch bookings
      </Button>
    </section>
  );
}
