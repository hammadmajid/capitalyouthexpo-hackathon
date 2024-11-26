'use client';
import { useQuery } from '@tanstack/react-query';
import { marketplacePrice, readBranchOccupancy, readPropertyRoomLocation } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { bedStatusText, bedTone, bedToneClass, toneLabel } from '../../lib/bed-tone';
import { occupiedInRooms } from '../../lib/property-occupancy';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { PropertyActions } from './property-actions';
import { RoomAmenities } from '../amenities/room-amenities';
import type { FloorRoom, FloorRooms } from './use-floor-rooms';
export type Level = {
  buildingId?: string;
  floorId?: string;
  roomId?: string;
  bedId?: string;
  add?: 'building' | 'floor' | 'room' | 'bed';
};
type Nav = { data: FloorRooms; go: (level: Level) => void };
const count = (value: number, word: string) => value + ' ' + word + (value === 1 ? '' : 's');
const liveBeds = (room: FloorRoom) => room.seats.filter((seat) => !seat.archivedAt);
const card = 'rounded-input border border-hsm-border bg-hsm-icy p-3';
export function BuildingsHome({ data, go }: Nav) {
  const unplaced = data.rooms.filter(
    (room) => data.floorOf(room.id) && !data.floorOf(room.id)?.floor,
  );
  return (
    <div className="space-y-3">
      {!data.floors.length ? <p>No buildings yet</p> : null}
      {data.floors.map((group) => {
        const rooms = data.rooms.filter((room) =>
          group.floors.some((floor) => data.floorOf(room.id)?.floor?.id === floor.id),
        );
        const parts = [
          count(group.floors.length, 'floor'),
          count(rooms.length, 'room'),
          count(rooms.flatMap(liveBeds).length, 'bed'),
          // Occupancy appears only for staff who may see stays (BR-05 stays private).
          ...(data.canSeeStays && data.occupancy.data
            ? [
                occupiedInRooms(
                  data.occupancy.data,
                  rooms.map((room) => room.id),
                ) + ' occupied',
              ]
            : []),
        ];
        return (
          <article key={group.building.id} className={card + ' space-y-2'}>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="flex-1 font-semibold text-hsm-heading">{group.building.name}</h4>
              {data.canEdit ? (
                <PropertyActions
                  data={data}
                  kind="building"
                  id={group.building.id}
                  name={group.building.name}
                  label={'building ' + group.building.name}
                  version={group.building.version}
                />
              ) : null}
            </div>
            <p className="text-hsm-secondary">{parts.join(' · ')}</p>
            <ul className="flex flex-wrap gap-2">
              {group.floors.map((floor) => (
                <li key={floor.id}>
                  <Button
                    variant="secondary"
                    onClick={() => go({ buildingId: group.building.id, floorId: floor.id })}
                  >
                    {'Open ' + (floor.label.trim() || 'floor ' + floor.levelNumber)}
                  </Button>
                </li>
              ))}
              {data.canEdit ? (
                <li>
                  <Button
                    variant="ghost"
                    onClick={() => go({ buildingId: group.building.id, add: 'floor' })}
                  >
                    {'Add floor to ' + group.building.name}
                  </Button>
                </li>
              ) : null}
            </ul>
          </article>
        );
      })}
      {unplaced.length ? (
        <section aria-label="Rooms without a floor" className="space-y-2">
          <h4 className="font-semibold">Rooms without a floor</h4>
          <p className="text-hsm-secondary">Open a room to place it on a floor.</p>
          {unplaced.map((room) => (
            <Button key={room.id} variant="secondary" onClick={() => go({ roomId: room.id })}>
              {'Room ' + room.label + ' · ' + count(liveBeds(room).length, 'bed')}
            </Button>
          ))}
        </section>
      ) : null}
      {data.canEdit ? (
        <Button onClick={() => go({ add: 'building' })}>Add building</Button>
      ) : (
        <p>View only</p>
      )}
    </div>
  );
}
export function FloorView({
  data,
  go,
  buildingId,
  floorId,
}: Nav & { buildingId: string; floorId: string }) {
  const group = data.floors.find((row) => row.building.id === buildingId);
  const floor = group?.floors.find((row) => row.id === floorId);
  if (!group || !floor) return <p>Floor unavailable</p>;
  const rooms = data.rooms.filter((room) => data.floorOf(room.id)?.floor?.id === floorId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex-1 font-semibold">{floor.label + ' · ' + group.building.name}</h4>
        {data.canEdit ? (
          <PropertyActions
            data={data}
            kind="floor"
            id={floor.id}
            name={floor.label}
            label={'floor ' + floor.label}
            version={floor.version}
            onRemoved={() => go({})}
          />
        ) : null}
      </div>
      {!rooms.length ? <p>No rooms on this floor yet.</p> : null}
      <ul className="space-y-2">
        {rooms.map((room) => (
          <li key={room.id}>
            <Button
              variant="secondary"
              onClick={() => go({ buildingId, floorId, roomId: room.id })}
            >
              {'Room ' + room.label + ' · ' + count(liveBeds(room).length, 'bed')}
            </Button>
          </li>
        ))}
      </ul>
      {data.canEdit ? (
        <Button onClick={() => go({ buildingId, floorId, add: 'room' })}>Add room</Button>
      ) : null}
    </div>
  );
}
export function RoomView({ data, go, level }: Nav & { level: Level & { roomId: string } }) {
  const room = data.rooms.find((row) => row.id === level.roomId);
  const live = useQuery({
    queryKey: ['bed-board', data.actorId, data.branchId, 'room', level.roomId],
    enabled: data.canSeeStays,
    retry: false,
    queryFn: () =>
      readBranchOccupancy(browserClient(), data.branchId, { roomId: level.roomId, limit: 1 }),
  });
  if (!room) return <p>Room unavailable</p>;
  const location = data.floorOf(room.id);
  const states = live.data?.data.find((row) => row.id === room.id)?.beds;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex-1 font-semibold">Room {room.label}</h4>
        {data.canEdit ? (
          <PropertyActions
            data={data}
            kind="room"
            id={room.id}
            name={room.label}
            label={'room ' + room.label}
            onRemoved={() => go({})}
          />
        ) : null}
      </div>
      <p className="text-hsm-secondary">
        {location?.floor
          ? location.floor.buildingName + ' · ' + location.floor.label
          : 'Not placed on a floor yet'}
      </p>
      {live.isError ? <p role="alert">{errorMessage(live.error)}</p> : null}
      <ul className="flex flex-wrap gap-2" aria-label={'Beds in room ' + room.label}>
        {liveBeds(room).map((bed) => {
          const actual = states?.find((row) => row.id === bed.id);
          const tone = actual ? bedTone(actual) : undefined;
          return (
            <li
              key={bed.id}
              className={
                'w-36 space-y-1 rounded-input border p-2 text-center ' +
                ((tone && bedToneClass[tone]) ?? 'border-hsm-border')
              }
            >
              <Button
                variant="ghost"
                aria-label={
                  'Bed ' + bed.label + ', ' + (actual ? bedStatusText(actual) : bed.status)
                }
                onClick={() => go({ ...level, bedId: bed.id })}
              >
                {bed.label}
              </Button>
              {bed.monthlyRentPaisa !== undefined && bed.monthlyRentPaisa !== null ? (
                <p className="text-xs">{marketplacePrice(bed.monthlyRentPaisa)}</p>
              ) : null}
              {tone ? <p className="text-xs font-semibold">{toneLabel[tone]}</p> : null}
              {data.canEdit ? (
                <PropertyActions
                  data={data}
                  kind="seat"
                  id={bed.id}
                  name={bed.label}
                  label={'bed ' + bed.label}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {data.canEdit ? <Button onClick={() => go({ ...level, add: 'bed' })}>Add bed</Button> : null}
      {location && !location.floor && data.canEdit ? (
        <PlaceRoom data={data} roomId={room.id} />
      ) : null}
      {data.canEdit ? (
        <RoomAmenities actorId={data.actorId} branchId={data.branchId} roomId={room.id} />
      ) : null}
    </div>
  );
}
// Only an unplaced room needs its location version (to place it); one read, this room only.
function PlaceRoom({ data, roomId }: { data: FloorRooms; roomId: string }) {
  const place = useQuery({
    queryKey: ['floor-rooms', data.actorId, data.branchId, 'location', roomId],
    retry: false,
    queryFn: () => readPropertyRoomLocation(browserClient(), data.branchId, roomId),
  });
  if (!place.data) return null;
  const version = place.data.version;
  return (
    <section aria-label="Place on a floor" className="space-y-2">
      <h4 className="font-semibold">Place on a floor</h4>
      <div className="flex flex-wrap gap-2">
        {data.floors.flatMap((group) =>
          group.floors.map((floor) => (
            <Button
              key={floor.id}
              variant="secondary"
              disabled={data.command.isPending || data.command.unresolved}
              onClick={() =>
                data.command.mutate({
                  kind: 'locate',
                  roomId,
                  floorId: floor.id,
                  expectedVersion: version,
                })
              }
            >
              {group.building.name + ' · ' + floor.label}
            </Button>
          )),
        )}
      </div>
    </section>
  );
}
