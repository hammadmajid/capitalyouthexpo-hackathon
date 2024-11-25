'use client';
import { useInventoryNavigationLock } from './inventory-navigation';
import { useState } from 'react';
import { ApiFailure } from '@hsm/api-client';
import type { RoomAmenitiesState } from '@hsm/contracts';
import { errorMessage } from '../lib/messages';
import { inventoryScopeDenied } from './use-branch-inventory';
import { useRoomAmenities } from './use-room-amenities';
import { RoomAmenitiesEditor } from './room-amenities-editor';
import { Button } from './ui/button';
type Props = { actorId: string; branchId: string; roomTypeId: string; roomLabel: string };
export function RoomTypeAmenities(props: Props) {
  return (
    <Amenities key={props.actorId + ':' + props.branchId + ':' + props.roomTypeId} {...props} />
  );
}
function Amenities({ actorId, branchId, roomTypeId, roomLabel }: Props) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<RoomAmenitiesState>(),
    [saved, setSaved] = useState(false);
  const { query, catalog, mutation, clearKeys } = useRoomAmenities(
    actorId,
    branchId,
    roomTypeId,
    open,
    () => {
      setDraft(undefined);
      setSaved(true);
    },
  );
  const denied = [query.error, mutation.error].find(
    (error) =>
      inventoryScopeDenied(error) || (error instanceof ApiFailure && error.code === 'NOT_FOUND'),
  );
  useInventoryNavigationLock((open && Boolean(query.data) && !denied) || mutation.isPending);
  function cancel() {
    if (!mutation.isPending) {
      setDraft(undefined);
      mutation.reset();
      clearKeys();
    }
  }
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View amenities for {roomLabel}
      </Button>
    );
  if (denied)
    return (
      <section aria-label={'Amenities for ' + roomLabel}>
        <p role="alert">{errorMessage(denied)}</p>
        <Button
          variant="secondary"
          onClick={() => {
            cancel();
            void query.refetch();
          }}
        >
          Retry room amenity access
        </Button>
      </section>
    );
  if (query.isPending) return <p role="status">Loading room amenities…</p>;
  const current = query.data;
  if (!current)
    return (
      <section aria-label={'Amenities for ' + roomLabel}>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry room amenities
        </Button>
      </section>
    );
  const conflict = Boolean(
    draft &&
    (draft.version !== current.version ||
      (mutation.error instanceof ApiFailure && mutation.error.code === 'PRECONDITION_FAILED')),
  );
  const unavailable = Boolean(query.error) || query.isFetching || mutation.isPending;
  const catalogUnavailable = catalog.isPending || Boolean(catalog.error) || catalog.isFetching;
  return (
    <section aria-label={'Amenities for ' + roomLabel} className="space-y-4">
      <h3 className="font-semibold">Amenities for {roomLabel}</h3>
      {saved ? <p role="status">Room amenities saved.</p> : null}
      {query.error ? (
        <p role="alert">{errorMessage(query.error)} Changes are disabled until access refreshes.</p>
      ) : null}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {!current.amenities.length ? (
        <p>No amenities are selected for this room type.</p>
      ) : (
        <ul>
          {current.amenities.map((row) => (
            <li key={row.code}>
              {row.name}
              {row.isActive ? '' : ' — Retired'}
            </li>
          ))}
        </ul>
      )}
      {!current.canEdit ? <p>Editing room amenities requires a listing grant.</p> : null}
      {conflict ? (
        <div>
          <p role="alert">
            Saved room amenities changed. Your draft is retained; reload current selections before
            saving.
          </p>
          <Button
            disabled={unavailable}
            onClick={() => {
              setDraft(current);
              mutation.reset();
            }}
          >
            Reload current room amenities
          </Button>
        </div>
      ) : null}
      {current.canEdit && draft ? (
        <RoomAmenitiesEditor
          key={draft.version}
          initial={draft}
          catalog={catalog.data?.pages.flatMap((page) => page.data) ?? []}
          disabled={unavailable || catalogUnavailable || conflict}
          pending={mutation.isPending}
          onSave={(input) => mutation.mutate({ version: draft.version, input })}
          onCancel={cancel}
        />
      ) : null}
      {current.canEdit && !draft ? (
        <Button
          disabled={unavailable || catalogUnavailable}
          onClick={() => {
            setDraft(current);
            setSaved(false);
            mutation.reset();
          }}
        >
          Edit room amenities
        </Button>
      ) : null}
      {catalog.error ? (
        <p role="alert">Approved amenities are unavailable. Existing selections are retained.</p>
      ) : null}
      {catalog.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={catalog.isFetching || mutation.isPending}
          onClick={() => void catalog.fetchNextPage()}
        >
          Load more approved room amenities
        </Button>
      ) : null}
      {catalog.error ? (
        <Button
          variant="secondary"
          disabled={catalog.isFetching || mutation.isPending}
          onClick={() => void catalog.refetch()}
        >
          Retry approved room amenities
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={query.isFetching || mutation.isPending}
        onClick={() => void query.refetch()}
      >
        Refresh room amenity access
      </Button>
      <Button
        variant="secondary"
        disabled={mutation.isPending}
        onClick={() => {
          cancel();
          setOpen(false);
          setSaved(false);
        }}
      >
        Close room amenities
      </Button>
    </section>
  );
}
