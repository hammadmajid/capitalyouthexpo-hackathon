'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readPropertyRoomLocation } from '@hsm/api-client';
import {
  propertyRoomLocationInputSchema,
  propertyRoomLocationSchema,
  type PropertyRoomLocation,
} from '@hsm/contracts';
import { usePropertyPages } from './use-property-pages';
import { PropertyPageControls } from './property-page-controls';
import { propertyScopeDenied, usePropertyCommand } from './property-command';
import { CommandRecovery } from './services/command-recovery';
import { useInventoryNavigationLock } from './inventory-navigation';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
type Props = {
  actorId: string;
  branchId: string;
  roomId: string;
  roomLabel: string;
  disabled: boolean;
};
export function PropertyRoomLocation(props: Props) {
  const [open, setOpen] = useState(false);
  return open ? (
    <LocationPanel
      key={props.actorId + ':' + props.branchId + ':' + props.roomId}
      {...props}
      close={() => setOpen(false)}
    />
  ) : (
    <Button
      type="button"
      variant="secondary"
      disabled={props.disabled}
      onClick={() => setOpen(true)}
    >
      Room {props.roomLabel} location
    </Button>
  );
}
function LocationPanel({
  actorId,
  branchId,
  roomId,
  roomLabel,
  close,
}: Props & { close: () => void }) {
  const query = useQuery({
    queryKey: ['property-room-location', actorId, branchId, roomId],
    gcTime: 0,
    retry: false,
    queryFn: () => readPropertyRoomLocation(browserClient(), branchId, roomId),
  });
  const command = usePropertyCommand(actorId, branchId, roomId);
  const denied = [query.error, command.error].find(propertyScopeDenied);
  useInventoryNavigationLock(
    !denied && (Boolean(query.data) || command.isPending || command.unresolved),
  );
  return (
    <section aria-label={'Room ' + roomLabel + ' location'} className="space-y-3">
      <h4 className="font-semibold">Room {roomLabel} location</h4>
      {denied ? (
        <p role="alert">{errorMessage(denied)}</p>
      ) : query.data ? (
        <LocationEditor
          actorId={actorId}
          branchId={branchId}
          roomId={roomId}
          initial={query.data}
          current={query.data}
          unavailable={query.isFetching || query.isError}
          command={command}
          refresh={() => void query.refetch()}
        />
      ) : (
        <>
          <p role={query.error ? 'alert' : 'status'}>
            {query.error ? errorMessage(query.error) : 'Loading room location…'}
          </p>
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Retry room location
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={command.isPending || (!denied && command.unresolved)}
        onClick={close}
      >
        Close room location
      </Button>
    </section>
  );
}
function LocationEditor({
  actorId,
  branchId,
  roomId,
  initial,
  current,
  unavailable,
  command,
  refresh,
}: {
  actorId: string;
  branchId: string;
  roomId: string;
  initial: PropertyRoomLocation;
  current: PropertyRoomLocation;
  unavailable: boolean;
  command: ReturnType<typeof usePropertyCommand>;
  refresh: () => void;
}) {
  const pages = usePropertyPages(actorId, branchId);
  const [version, setVersion] = useState(initial.version),
    [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const denied = [pages.buildings.error, pages.floors.error].find(propertyScopeDenied);
  const conflict = current.version !== version;
  const busy = command.isPending || command.unresolved;
  const editable = current.canEdit && current.archivedAt === null && pages.canEdit && !unavailable;
  const disabled = busy || !editable || conflict;
  const result = propertyRoomLocationSchema.safeParse(command.data);
  const confirmed =
    command.isSuccess &&
    !unavailable &&
    result.success &&
    result.data.version === current.version &&
    result.data.floor?.id === current.floor?.id;
  function save(floorId: string | null) {
    const input = propertyRoomLocationInputSchema.safeParse({
      expectedVersion: version,
      floorId,
      reason,
    });
    if (!input.success) {
      setError(true);
      return;
    }
    command.mutate({ kind: 'location', id: roomId, input: input.data });
  }
  if (denied) return <p role="alert">{errorMessage(denied)}</p>;
  return (
    <div className="space-y-2">
      <p>
        Current:{' '}
        {current.floor ? current.floor.buildingName + ' / ' + current.floor.label : 'Unclassified'}.
        This corrects room metadata; it does not transfer a resident.
      </p>
      <PropertyPageControls state={pages} disabled={busy} />
      {unavailable ? (
        <>
          <p role="alert">
            Room access could not refresh. Your reason is retained; retry before saving.
          </p>
          <Button type="button" variant="secondary" disabled={busy} onClick={refresh}>
            Retry room access
          </Button>
        </>
      ) : null}
      {conflict && !confirmed ? (
        <p role="alert">
          Room location changed. Reload its current version before saving your reason.
        </p>
      ) : null}
      {conflict ? (
        <Button
          type="button"
          variant="secondary"
          disabled={busy || unavailable}
          onClick={() => {
            setVersion(current.version);
            command.reset();
          }}
        >
          Use current room version
        </Button>
      ) : null}
      {!current.canEdit ? <p>Room location editing requires an inventory grant.</p> : null}
      <label className="field-label">
        Correction reason
        <input
          className="field-input"
          aria-label="Room location reason"
          value={reason}
          maxLength={500}
          disabled={disabled}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error ? <p role="alert">Enter a correction reason before saving.</p> : null}
      {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
      <CommandRecovery command={{ ...command, isPending: command.isPending || !editable }} />
      {confirmed ? <p role="status">Room location saved and refreshed.</p> : null}
      <Button
        type="button"
        disabled={
          disabled ||
          !pages.floor ||
          Boolean(pages.floor.archivedAt) ||
          Boolean(pages.building?.archivedAt)
        }
        onClick={() => {
          if (pages.floor) save(pages.floor.id);
        }}
      >
        Assign selected floor
      </Button>{' '}
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || current.floor === null}
        onClick={() => save(null)}
      >
        Clear room classification
      </Button>
    </div>
  );
}
