'use client';
import { useState } from 'react';
import { errorMessage } from '../../lib/messages';
import { BedDetail } from '../bed-detail';
import { BedRent } from '../bed-rent';
import { Button } from '../ui/button';
import { AddBed, AddBuilding, AddFloor, AddRoom } from './add-forms';
import { BuildingsHome, FloorView, RoomView, type Level } from './rooms-views';
import { useFloorRooms } from './use-floor-rooms';
type Props = { actorId: string; branchId: string };
// exactOptionalPropertyTypes: leaving a level drops its key rather than setting undefined.
function without(level: Level, ...keys: (keyof Level)[]): Level {
  return Object.fromEntries(
    Object.entries(level).filter(([key]) => !keys.includes(key as keyof Level)),
  ) as Level;
}
// HSM-SETUP (user direction 2026-10-29) / CHG-057: Building → Floor → Room → Bed, one level at
// a time, the same hierarchy as mobile Hostel Setup › Building & Rooms.
export function RoomsPanel({ actorId, branchId }: Props) {
  const data = useFloorRooms(actorId, branchId);
  const [level, setLevel] = useState<Level>({});
  const failure =
    data.inventory.error ?? data.buildings.error ?? data.floorsError ?? data.locationsError;
  return (
    <section
      aria-label="Building & Rooms"
      className="space-y-3 rounded-input border border-hsm-border p-4"
    >
      <h3 className="font-semibold">Building &amp; Rooms</h3>
      <Trail level={level} data={data} go={setLevel} />
      {failure ? <p role="alert">{errorMessage(failure)}</p> : null}
      {!data.inventory.data || !data.buildings.data ? (
        failure ? null : (
          <p role="status">Loading buildings, floors and rooms…</p>
        )
      ) : (
        <Body {...{ actorId, branchId, data, level }} go={setLevel} />
      )}
    </section>
  );
}
function Body(
  props: Props & {
    data: ReturnType<typeof useFloorRooms>;
    level: Level;
    go: (level: Level) => void;
  },
) {
  const { data, level, go } = props;
  // Closing an add form returns to the level it was opened from.
  const back = () => go(without(level, 'add'));
  if (level.add === 'building') return <AddBuilding data={data} done={back} />;
  if (level.add === 'floor' && level.buildingId)
    return <AddFloor data={data} done={back} buildingId={level.buildingId} />;
  if (level.add === 'room' && level.floorId)
    return <AddRoom data={data} done={back} floorId={level.floorId} />;
  if (level.add === 'bed' && level.roomId)
    return <AddBed data={data} done={back} roomId={level.roomId} />;
  if (level.roomId && level.bedId)
    return data.canSeeStays ? (
      <BedDetail
        actorId={props.actorId}
        branchId={props.branchId}
        bedId={level.bedId}
        on=""
        close={() => go(without(level, 'bedId'))}
      />
    ) : (
      <BedRent actorId={props.actorId} branchId={props.branchId} bedId={level.bedId} />
    );
  if (level.roomId)
    return <RoomView data={data} go={go} level={{ ...level, roomId: level.roomId }} />;
  if (level.buildingId && level.floorId)
    return <FloorView data={data} go={go} buildingId={level.buildingId} floorId={level.floorId} />;
  return <BuildingsHome data={data} go={go} />;
}
// Breadcrumb back-navigation: one level at a time, like Android Back on mobile.
function Trail({
  level,
  data,
  go,
}: {
  level: Level;
  data: ReturnType<typeof useFloorRooms>;
  go: (level: Level) => void;
}) {
  if (!level.buildingId && !level.roomId && !level.add) return null;
  const building = data.buildingList.find((row) => row.id === level.buildingId);
  const floor = data.floors
    .flatMap((group) => group.floors)
    .find((row) => row.id === level.floorId);
  const room = data.rooms.find((row) => row.id === level.roomId);
  return (
    <nav aria-label="Setup location" className="flex flex-wrap items-center gap-1 text-sm">
      <Button variant="ghost" onClick={() => go({})}>
        All buildings
      </Button>
      {building && floor ? (
        <Button variant="ghost" onClick={() => go({ buildingId: building.id, floorId: floor.id })}>
          {'› ' + building.name + ' · ' + floor.label}
        </Button>
      ) : null}
      {room && (level.bedId || level.add) ? (
        <Button variant="ghost" onClick={() => go(without(level, 'bedId', 'add'))}>
          {'› Room ' + room.label}
        </Button>
      ) : null}
    </nav>
  );
}
