import { PropertyActions } from './property-actions';
import { NavIconButton } from './navigation/header';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readPropertyRoomLocation } from '@hsm/api-client';
import { View } from 'react-native';
import { OwnerBedGrid } from './owner-bed-grid';
import { OwnerMediaGallery } from './owner-media-gallery';
import { OwnerRoomAmenities } from './owner-room-amenities';
import { backToRooms, openRoomsLevel, type RoomsLevel } from './owner-setup-nav';
import { canEditInventory } from './owner-floor-rooms';
import type { FloorRooms } from './use-floor-rooms';
import { ChoiceTile, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
// Room screen: room photo, its beds (each with a required photo) and this room's amenities.
export function OwnerRoomScreen({
  actorId,
  brandId,
  level,
  data,
}: {
  actorId: string;
  brandId: string;
  level: RoomsLevel & { roomId: string };
  data: FloorRooms;
}) {
  const room = data.rooms.find((row) => row.id === level.roomId);
  // While a bed is open, the room screen shows only that bed.
  const [bedOpen, setBedOpen] = useState(false);
  const canEdit = canEditInventory(data);
  const busy = data.command.isPending || data.command.unresolved;
  // Only an unplaced room needs its location version (to place it); one read, this room only.
  const unplaced = room ? data.floorOf(room.id)?.floor === null : false;
  const place = useQuery({
    queryKey: ['floor-rooms', actorId, data.branchId, 'location', level.roomId],
    enabled: unplaced,
    retry: false,
    queryFn: () => data.read((c) => readPropertyRoomLocation(c, data.branchId, level.roomId)),
  });
  if (!room)
    return (
      <SetupCard>
        <SetupText>Room unavailable</SetupText>
        <NavIconButton label="Back to Building & Rooms" onPress={() => backToRooms(brandId)} />
      </SetupCard>
    );
  const location = data.floorOf(room.id);
  return (
    <>
      <SetupCard>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <SetupHeading>Room {room.label}</SetupHeading>
          {canEdit ? (
            <PropertyActions
              data={data}
              kind="room"
              id={room.id}
              name={room.label}
              label={'room ' + room.label}
              onRemoved={() => backToRooms(brandId)}
            />
          ) : null}
        </View>
        <SetupText muted>
          {location?.floor
            ? location.floor.buildingName + ' · ' + location.floor.label
            : 'Not placed on a floor yet'}
        </SetupText>
        <OwnerBedGrid
          actorId={actorId}
          room={room}
          data={data}
          add={canEdit ? () => openRoomsLevel(brandId, { ...level, add: 'bed' }) : undefined}
          onSelect={setBedOpen}
        />
        {bedOpen ? null : (
          <OwnerMediaGallery
            actorId={actorId}
            branchId={data.branchId}
            roomId={room.id}
            title="Room photos"
            compact
          />
        )}
      </SetupCard>
      {bedOpen ? null : (
        <>
          {location && !location.floor && canEdit && place.data ? (
            <SetupCard>
              <SetupHeading>Place on a floor</SetupHeading>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {data.floors.flatMap((group) =>
                  group.floors.map((floor) => (
                    <ChoiceTile
                      key={floor.id}
                      label={group.building.name + ' · ' + floor.label}
                      selected={false}
                      disabled={busy}
                      onPress={() =>
                        data.command.mutate({
                          kind: 'locate',
                          roomId: room.id,
                          floorId: floor.id,
                          expectedVersion: place.data.version,
                        })
                      }
                    />
                  )),
                )}
              </View>
            </SetupCard>
          ) : null}
          <OwnerRoomAmenities actorId={actorId} branchId={data.branchId} roomId={room.id} />
        </>
      )}
    </>
  );
}
