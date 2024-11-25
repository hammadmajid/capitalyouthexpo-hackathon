'use client';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { duplicateInventoryRoom, RetainedRoomDuplication } from '@hsm/api-client';
import { roomDuplicationInputSchema } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { useInventoryNavigationLock } from './inventory-navigation';
type Props = {
  actorId: string;
  branchId: string;
  rooms: { id: string; label: string; archivedAt: string | null }[];
  unavailable: boolean;
  blocked: boolean;
};
export function RoomDuplication(props: Props) {
  return <Panel key={props.actorId + ':' + props.branchId} {...props} />;
}
function Panel({ actorId, branchId, rooms, unavailable, blocked }: Props) {
  const [open, setOpen] = useState(false),
    [roomId, setRoom] = useState(''),
    [labels, setLabels] = useState(''),
    [saved, setSaved] = useState(false);
  const cache = useQueryClient(),
    retained = useRef<RetainedRoomDuplication | null>(null);
  retained.current ??= new RetainedRoomDuplication((command, key) =>
    duplicateInventoryRoom(browserClient(), branchId, command.roomId, command.body, key),
  );
  const intent = retained.current;
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (retry: boolean) =>
      retry
        ? intent.retry()
        : intent.send(
            { roomId, body: { roomNumbers: labels.split(/[,\n]/) } },
            crypto.randomUUID(),
          ),
    onSuccess: async () => {
      intent.reset();
      setLabels('');
      setSaved(true);
      await cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] });
    },
  });
  const locked = mutation.isPending || intent.locked;
  useInventoryNavigationLock(open || locked);
  const valid =
    roomDuplicationInputSchema.safeParse({ roomNumbers: labels.split(/[,\n]/) }).success &&
    rooms.some((room) => room.id === roomId && !room.archivedAt);
  if (!open)
    return (
      <Button
        variant="secondary"
        disabled={blocked || unavailable || !rooms.length}
        onClick={() => {
          setOpen(true);
          setSaved(false);
        }}
      >
        Duplicate rooms
      </Button>
    );
  return (
    <section className="space-y-3" aria-label="Duplicate rooms">
      <p>
        Copy capacity, pricing and amenities from a room type. New rooms and beds start inactive.
        Review them and provide their required photos before publication.
      </p>
      {saved ? (
        <p role="status">
          Rooms duplicated. Refresh or page through inventory to review the new rooms.
        </p>
      ) : null}
      <label className="field-label">
        Source room
        <select
          className="field-input"
          value={roomId}
          disabled={locked || unavailable}
          onChange={(event) => setRoom(event.target.value)}
        >
          <option value="">Choose a room</option>
          {rooms
            .filter((room) => !room.archivedAt)
            .map((room) => (
              <option key={room.id} value={room.id}>
                {room.label}
              </option>
            ))}
        </select>
      </label>
      <label className="field-label">
        New room numbers
        <textarea
          className="field-input"
          value={labels}
          maxLength={8000}
          disabled={locked || unavailable}
          onChange={(event) => setLabels(event.target.value)}
        />
      </label>
      <p>
        Enter up to 100 unique room numbers, separated by commas or new lines, with at most 5000 new
        beds per batch. Existing numbers reject the whole batch.
      </p>
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {intent.locked && !mutation.isPending ? (
        <Button disabled={unavailable} onClick={() => mutation.mutate(true)}>
          Retry original duplication
        </Button>
      ) : (
        <Button
          disabled={locked || unavailable || !valid}
          onClick={() => {
            setSaved(false);
            mutation.mutate(false);
          }}
        >
          {mutation.isPending ? 'Duplicating…' : 'Create duplicate rooms'}
        </Button>
      )}
      <Button
        variant="secondary"
        disabled={locked}
        onClick={() => {
          intent.reset();
          mutation.reset();
          setOpen(false);
        }}
      >
        Close duplication
      </Button>
    </section>
  );
}
