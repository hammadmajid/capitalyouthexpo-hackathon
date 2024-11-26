import { View } from 'react-native';
import { NavIconButton } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { PropertyActions } from './property-actions';
import { OwnerFloorGrid } from './owner-floor-grid';
import { backToRooms, openRoomsLevel } from './owner-setup-nav';
import { canEditInventory } from './owner-floor-rooms';
import type { FloorRooms } from './use-floor-rooms';
import { SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
// Building screen: its floors; each floor opens its own rooms screen.
export function OwnerBuildingScreen({
  brandId,
  buildingId,
  data,
}: {
  brandId: string;
  buildingId: string;
  data: FloorRooms;
}) {
  const group = data.floors.find((row) => row.building.id === buildingId);
  const canEdit = canEditInventory(data);
  if (!group)
    return (
      <SetupCard>
        <SetupText>Building unavailable</SetupText>
        <NavIconButton label="Back to Building & Rooms" onPress={() => backToRooms(brandId)} />
      </SetupCard>
    );
  return (
    <>
      <SetupCard>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <SetupHeading>{group.building.name}</SetupHeading>
          {canEdit ? (
            <PropertyActions
              data={data}
              kind="building"
              id={group.building.id}
              name={group.building.name}
              label={'building ' + group.building.name}
              version={group.building.version}
              onRemoved={() => backToRooms(brandId)}
            />
          ) : null}
        </View>
        {group.query?.isPending ? <Skeleton kind="list" label="Loading floors…" /> : null}
        {group.query?.data && !group.floors.length ? (
          <SetupText muted>No floors yet.</SetupText>
        ) : null}
        <OwnerFloorGrid
          floors={group.floors}
          action={
            canEdit
              ? (floor) => (
                  <PropertyActions
                    data={data}
                    name={floor.label}
                    kind="floor"
                    id={floor.id}
                    label={'floor ' + floor.label}
                    version={floor.version}
                  />
                )
              : undefined
          }
          open={(floor) => openRoomsLevel(brandId, { buildingId, floorId: floor.id })}
          busy={data.command.isPending || data.command.unresolved}
          detail={(floor) => {
            const rooms = data.rooms.filter(
              (room) => data.floorOf(room.id)?.floor?.id === floor.id,
            );
            return rooms.length + (rooms.length === 1 ? ' room' : ' rooms');
          }}
          add={canEdit ? () => openRoomsLevel(brandId, { buildingId, add: 'floor' }) : undefined}
        />
      </SetupCard>
    </>
  );
}
