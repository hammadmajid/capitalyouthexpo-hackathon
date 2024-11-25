import type { readBranchInventory } from '@hsm/api-client';
import { Button } from './ui/button';
import { InventoryPageControls } from './inventory-page-controls';
import { ListingGallery } from './listing-gallery';
import type { InventoryPaging } from './use-paged-inventory';
import { PropertyRoomLocation } from './property-room-location';
type Inventory = Awaited<ReturnType<typeof readBranchInventory>>;
export function InventoryRoomList({
  actorId,
  branchId,
  rooms,
  edit,
  pending,
  navigationDisabled,
  paging,
  onBed,
  onLifecycle,
}: {
  actorId: string;
  branchId: string;
  rooms: Inventory['rooms'];
  edit: boolean;
  pending: boolean;
  navigationDisabled: boolean;
  paging: InventoryPaging;
  onBed: (roomId: string) => void;
  onLifecycle: (resource: 'room' | 'seat', id: string, label: string, archive: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      {!rooms.length ? <p>No rooms on this page.</p> : null}
      {rooms.map((room) => (
        <div key={room.id} className="space-y-2 border-t border-hsm-border pt-3">
          <h4 className="font-semibold">
            Room {room.label} · {room.archivedAt ? 'Archived' : room.status}
          </h4>
          <PropertyRoomLocation
            actorId={actorId}
            branchId={branchId}
            roomId={room.id}
            roomLabel={room.label}
            disabled={navigationDisabled || pending}
          />
          {!room.archivedAt && edit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={pending} onClick={() => onBed(room.id)}>
                Add bed to {room.label}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => onLifecycle('room', room.id, 'Room ' + room.label, false)}
              >
                Room {room.label} availability
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => onLifecycle('room', room.id, 'Room ' + room.label, true)}
              >
                Archive room {room.label}
              </Button>
            </div>
          ) : null}
          {!room.archivedAt ? (
            <ListingGallery
              actorId={actorId}
              branchId={branchId}
              target={{ kind: 'room', roomId: room.id }}
              title={'Room ' + room.label + ' photos'}
            />
          ) : null}
          {paging.selectedRoomId !== room.id ? (
            <Button
              variant="secondary"
              disabled={navigationDisabled}
              onClick={() => paging.selectRoom(room.id)}
            >
              View beds in room {room.label}
            </Button>
          ) : (
            <div className="space-y-2">
              {!room.seats.length ? <p>No beds on this page.</p> : null}
              {room.seats.map((seat) => (
                <div key={seat.id}>
                  <p>
                    Bed {seat.label} · Number {seat.ordinal} ·{' '}
                    {seat.archivedAt ? 'Archived' : seat.status}
                  </p>
                  {!seat.archivedAt && !room.archivedAt && edit ? (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => onLifecycle('seat', seat.id, 'Bed ' + seat.label, false)}
                      >
                        Bed {seat.label} availability
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => onLifecycle('seat', seat.id, 'Bed ' + seat.label, true)}
                      >
                        Archive bed {seat.label}
                      </Button>
                    </div>
                  ) : null}
                  {!seat.archivedAt && !room.archivedAt ? (
                    <ListingGallery
                      actorId={actorId}
                      branchId={branchId}
                      target={{ kind: 'bed', roomId: room.id, bedId: seat.id }}
                      title={'Bed ' + seat.label + ' photos'}
                    />
                  ) : null}
                </div>
              ))}
              <InventoryPageControls
                label="bed"
                current={Boolean(paging.bedCursor)}
                next={Boolean(paging.nextBedCursor)}
                disabled={navigationDisabled}
                onFirst={paging.firstBeds}
                onNext={paging.nextBeds}
              />
            </div>
          )}
        </div>
      ))}
      <InventoryPageControls
        label="room"
        current={Boolean(paging.roomCursor)}
        next={Boolean(paging.nextRoomCursor)}
        disabled={navigationDisabled}
        onFirst={paging.firstRooms}
        onNext={paging.nextRooms}
      />
    </div>
  );
}
