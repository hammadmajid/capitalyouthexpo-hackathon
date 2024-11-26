import { OwnerExpandableBuilding } from './owner-expandable-building';
import { safeMessage } from '../lib/messages';
import { DrillTile } from './owner-ui';
import { openRoomsLevel } from './owner-setup-nav';
import type { FloorRooms } from './use-floor-rooms';
import { SetupButton, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
// HSM-SETUP (user direction 2026-10-29): Building → Floor → Room → Bed, one level per
// screen. This root screen adds buildings; each building opens its own floors screen.
export function canEditInventory(data: FloorRooms) {
  return (
    (data.inventory.data?.permissions ?? []).includes('inventory_edit') &&
    (data.buildings.data?.canEdit ?? false)
  );
}
export function plural(count: number, word: string) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}
export function OwnerBuildingsHome({ brandId, data }: { brandId: string; data: FloorRooms }) {
  const { command } = data;
  const canEdit = canEditInventory(data);
  const busy = command.isPending || command.unresolved;
  const unplaced = data.rooms.filter(
    (room) => data.floorOf(room.id) && !data.floorOf(room.id)?.floor,
  );
  return (
    <>
      <SetupCard>
        {!data.floors.length ? <SetupText muted>No buildings yet</SetupText> : null}
        {data.floors.map((group) => (
          <OwnerExpandableBuilding
            key={group.building.id}
            brandId={brandId}
            group={group}
            data={data}
            canEdit={canEdit}
          />
        ))}
        {canEdit ? (
          <SetupButton
            secondary
            label="Add building"
            disabled={busy}
            onPress={() => openRoomsLevel(brandId, { add: 'building' })}
          />
        ) : (
          <SetupText muted>View only</SetupText>
        )}
      </SetupCard>
      {unplaced.length ? (
        <SetupCard>
          <SetupHeading>Rooms without a floor</SetupHeading>
          <SetupText muted>Open a room to place it on a floor.</SetupText>
          {unplaced.map((room) => (
            <DrillTile
              key={room.id}
              title={'Room ' + room.label}
              detail={plural(room.seats.filter((seat) => !seat.archivedAt).length, 'bed')}
              onPress={() => openRoomsLevel(brandId, { roomId: room.id })}
            />
          ))}
        </SetupCard>
      ) : null}
      {command.unresolved && !command.isPending ? (
        <SetupButton label="Retry previous change" onPress={() => command.retryOriginal()} />
      ) : null}
      {command.error ? <SetupText alert>{safeMessage(command.error)}</SetupText> : null}
    </>
  );
}
