'use client';
import { useInventoryNavigationLock } from './inventory-navigation';
import { useState } from 'react';
import { ApiFailure, type BookingPolicyTarget } from '@hsm/api-client';
import { useBookingPolicySettings } from './use-booking-policy-settings';
import { errorMessage } from '../lib/messages';
import { BookingPolicySummary } from './booking-policy-summary';
import { inventoryScopeDenied } from './use-branch-inventory';
import { BookingPolicyEditor } from './booking-policy-editor';
import { Button } from './ui/button';
export function BookingPolicySettings(props: { actorId: string; target: BookingPolicyTarget }) {
  return <PolicySettings key={props.actorId + ':' + JSON.stringify(props.target)} {...props} />;
}
function PolicySettings({ actorId, target }: { actorId: string; target: BookingPolicyTarget }) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState(false),
    [saved, setSaved] = useState(false);
  const { query, mutation, clearKeys } = useBookingPolicySettings(actorId, target, open, () => {
    setEditing(false);
    setSaved(true);
  });
  const denied = [query.error, mutation.error].find(
    (error) =>
      inventoryScopeDenied(error) || (error instanceof ApiFailure && error.code === 'NOT_FOUND'),
  );
  useInventoryNavigationLock((open && Boolean(query.data) && !denied) || mutation.isPending);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View booking policy
      </Button>
    );
  if (denied)
    return (
      <section aria-label="Booking policy">
        <p role="alert">{errorMessage(denied)}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setEditing(false);
            mutation.reset();
            void query.refetch();
          }}
        >
          Retry policy access
        </Button>
      </section>
    );
  if (query.isPending) return <p role="status">Loading booking policy…</p>;
  if (!query.data)
    return (
      <section aria-label="Booking policy">
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry booking policy
        </Button>
      </section>
    );
  const settings = query.data,
    root = target.level === 'platform';
  const editable = settings.canEdit && (settings.configured || root);
  return (
    <section aria-label="Booking policy" className="space-y-4">
      <h2 className="text-xl font-semibold">Booking policy</h2>
      {query.error ? (
        <>
          <p role="alert">Saved values are shown. Recheck access before making changes.</p>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Refresh policy access
          </Button>
        </>
      ) : null}
      {saved ? (
        <p role="status">
          {query.isFetching
            ? 'Booking policy saved. Refreshing server values…'
            : 'Booking policy saved. Current server values appear below.'}
        </p>
      ) : null}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {settings.configured ? (
        <>
          <p>
            Local override: {settings.localVersion ? 'Configured' : 'Inherited'}. Existing bookings
            retain their agreed policy snapshot.
          </p>
          <BookingPolicySummary settings={settings} />
        </>
      ) : (
        <p>
          Platform booking defaults are not configured.{' '}
          {root
            ? 'Enter every default and safety limit to enable configuration.'
            : 'A Root administrator must configure them first.'}
        </p>
      )}
      {editing && editable ? (
        <BookingPolicyEditor
          settings={settings}
          pending={mutation.isPending}
          disabled={Boolean(query.error) || query.isFetching || mutation.isPending}
          onSave={(input) => mutation.mutate(input)}
          onCancel={() => {
            setEditing(false);
            mutation.reset();
          }}
        />
      ) : editable ? (
        <Button
          disabled={Boolean(query.error) || query.isFetching || mutation.isPending}
          onClick={() => {
            setEditing(true);
            setSaved(false);
            mutation.reset();
          }}
        >
          Edit booking policy
        </Button>
      ) : (
        <p>You have read-only access to these settings.</p>
      )}
      <Button
        variant="secondary"
        disabled={mutation.isPending}
        onClick={() => {
          setOpen(false);
          setEditing(false);
          setSaved(false);
          mutation.reset();
          clearKeys();
        }}
      >
        Close booking policy
      </Button>
    </section>
  );
}
