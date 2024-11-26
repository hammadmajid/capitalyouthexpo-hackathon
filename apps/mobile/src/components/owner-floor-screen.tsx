import { View } from 'react-native';
import { PropertyActions } from './property-actions';
import { NavIconButton } from './navigation/header';
import { OwnerExpandableRoom } from './owner-expandable-room';
import { backToRooms, openRoomsLevel } from './owner-setup-nav';
import { canEditInventory } from './owner-floor-rooms';
import type { FloorRooms } from './use-floor-rooms';
import { SetupButton, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
// Floor screen: its rooms; each room opens its own beds and amenities screen.
export function OwnerFloorScreen({
  brandId,
  buildingId,
  floorId,
  data,
}: {
  brandId: string;
  buildingId: string;
  floorId: string;
  data: FloorRooms;
}) {
  const group = data.floors.find((row) => row.building.id === buildingId);
  const floor = group?.floors.find((row) => row.id === floorId);
  const canEdit = canEditInventory(data);
  if (!group || !floor)
    return (
      <SetupCard>
        <SetupText>Floor unavailable</SetupText>
        <NavIconButton label="Back to Building & Rooms" onPress={() => backToRooms(brandId)} />
      </SetupCard>
    );
  const rooms = data.rooms.filter((room) => data.floorOf(room.id)?.floor?.id === floorId);
  return (
    <>
      <SetupCard>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <SetupHeading>{floor.label}</SetupHeading>
          {canEdit ? (
            <PropertyActions
              data={data}
              kind="floor"
              id={floor.id}
              name={floor.label}
              label={'floor ' + floor.label}
              version={floor.version}
              onRemoved={() => backToRooms(brandId)}
            />
          ) : null}
        </View>
        <SetupText muted>{group.building.name}</SetupText>
        {!rooms.length ? <SetupText muted>No rooms on this floor yet.</SetupText> : null}
        {rooms.map((room) => (
          <OwnerExpandableRoom
            key={room.id}
            brandId={brandId}
            buildingId={buildingId}
            floorId={floorId}
            room={room}
            data={data}
          />
        ))}
        {canEdit ? (
          <SetupButton
            secondary
            label="Add room"
            onPress={() => openRoomsLevel(brandId, { buildingId, floorId, add: 'room' })}
          />
        ) : null}
      </SetupCard>
    </>
  );
}
