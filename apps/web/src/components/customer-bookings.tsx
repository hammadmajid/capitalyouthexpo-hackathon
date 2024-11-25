'use client';
import { useState } from 'react';
import { MarketplaceButton as Button } from './ui/marketplace-button';
import { errorMessage } from '../lib/messages';
import { inventoryScopeDenied } from './use-branch-inventory';
import { useCustomerBookings } from './use-customer-bookings';
import { CustomerBookingCard } from './customer-booking-card';
import { CustomerCancellationForm } from './customer-cancellation-form';
export function CustomerBookings(props: { actorId: string }) {
  return <BookingHistory key={props.actorId} {...props} />;
}
function BookingHistory({ actorId }: { actorId: string }) {
  const [selection, setSelection] = useState<string>(),
    [saved, setSaved] = useState(false);
  const { query, cancel, clearKeys } = useCustomerBookings(actorId, () => {
    setSelection(undefined);
    setSaved(true);
  });
  function close() {
    setSelection(undefined);
    cancel.reset();
    clearKeys();
  }
  const denied = [query.error, cancel.error].find(inventoryScopeDenied);
  if (denied)
    return (
      <section aria-label="My bookings">
        <p role="alert">{errorMessage(denied)}</p>
        <Button
          variant="secondary"
          onClick={() => {
            close();
            void query.refetch();
          }}
        >
          Retry booking access
        </Button>
      </section>
    );
  if (query.isPending)
    return <div role="status" aria-label="Loading bookings" className="customer-skeleton h-44" />;
  if (!query.data)
    return (
      <section aria-label="My bookings">
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry bookings
        </Button>
      </section>
    );
  const rows = query.data.pages.flatMap((page) => page.data),
    selected = rows.find((booking) => booking.id === selection);
  const available =
    selected &&
    selected.quote.policy.cancellationAllowed &&
    (selected.state === 'confirmed' || selected.state === 'pending_request');
  const disabled = cancel.isPending || query.isFetching || Boolean(query.error);
  return (
    <section aria-label="My bookings" className="space-y-4">
      <h3 className="text-xl font-semibold">My bookings</h3>
      {saved ? <p role="status">Cancellation saved by the server.</p> : null}
      {query.error ? (
        <>
          <p role="alert">
            Bookings could not refresh. Displayed records may be out of date; cancellation is
            disabled.
          </p>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Refresh bookings
          </Button>
        </>
      ) : null}
      {cancel.error ? <p role="alert">{errorMessage(cancel.error)}</p> : null}
      {rows.length === 0 ? <p>You have no bookings yet.</p> : null}
      {rows.map((booking) => (
        <div key={booking.id} className="space-y-3">
          <CustomerBookingCard
            actorId={actorId}
            booking={booking}
            disabled={disabled}
            onCancel={() => {
              setSelection(booking.id);
              setSaved(false);
              cancel.reset();
            }}
          />
          {selection === booking.id && available ? (
            <CustomerCancellationForm
              key={booking.id}
              pending={cancel.isPending}
              disabled={Boolean(query.error) || query.isFetching}
              onSave={(reason) => cancel.mutate({ id: booking.id, reason })}
              onClose={close}
            />
          ) : null}
        </div>
      ))}
      {selection && !available ? (
        <div>
          <p role="alert">This booking is no longer available for cancellation.</p>
          <Button variant="secondary" onClick={close}>
            Close unavailable cancellation
          </Button>
        </div>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading more bookings…' : 'More bookings'}
        </Button>
      ) : null}
    </section>
  );
}
