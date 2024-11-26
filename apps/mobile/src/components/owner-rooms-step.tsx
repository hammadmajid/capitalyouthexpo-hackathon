import { Skeleton } from './loading/skeleton';
import { safeMessage } from '../lib/messages';
import { OwnerBuildingsHome } from './owner-floor-rooms';
import { OwnerBuildingScreen } from './owner-building-card';
import { OwnerFloorScreen } from './owner-floor-screen';
import { OwnerRoomScreen } from './owner-room-screen';
import {
  AddBedScreen,
  AddBuildingScreen,
  AddFloorScreen,
  AddRoomScreen,
} from './owner-add-screens';
import type { RoomsLevel } from './owner-setup-nav';
import { useFloorRooms } from './use-floor-rooms';
import { SetupButton, SetupCard, SetupText } from './owner-wizard-ui';
// Step 3 drill-down: root (buildings) → building (floors) → floor (rooms) → room (beds).
// Each level is its own route entry, so Android Back returns one level at a time.
export function OwnerRoomsStep({
  actorId,
  branchId,
  brandId,
  level,
  next,
}: {
  actorId: string;
  branchId: string;
  brandId: string;
  level: RoomsLevel;
  next: () => void;
}) {
  const data = useFloorRooms(actorId, branchId);
  const failure = data.inventory.error ?? data.buildings.error ?? data.floorsError;
  if (failure)
    return (
      <SetupCard>
        <SetupText alert>{safeMessage(failure)}</SetupText>
      </SetupCard>
    );
  if (!data.inventory.data || !data.buildings.data)
    return <Skeleton kind="list" label="Loading buildings, floors and rooms…" />;
  if (level.add === 'building') return <AddBuildingScreen data={data} />;
  if (level.add === 'floor' && level.buildingId)
    return <AddFloorScreen data={data} buildingId={level.buildingId} />;
  if (level.add === 'room' && level.floorId)
    return <AddRoomScreen actorId={actorId} data={data} floorId={level.floorId} />;
  if (level.add === 'bed' && level.roomId)
    return <AddBedScreen actorId={actorId} data={data} roomId={level.roomId} />;
  if (level.roomId)
    return (
      <OwnerRoomScreen
        actorId={actorId}
        brandId={brandId}
        level={{ ...level, roomId: level.roomId }}
        data={data}
      />
    );
  if (level.buildingId && level.floorId)
    return (
      <OwnerFloorScreen
        brandId={brandId}
        buildingId={level.buildingId}
        floorId={level.floorId}
        data={data}
      />
    );
  if (level.buildingId)
    return <OwnerBuildingScreen brandId={brandId} buildingId={level.buildingId} data={data} />;
  return (
    <>
      <OwnerBuildingsHome brandId={brandId} data={data} />
      <SetupButton label="Save & Continue" onPress={next} />
    </>
  );
}
