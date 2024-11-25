import { marketplacePrice } from '@hsm/api-client';
import type { InventoryTarget } from '@hsm/contracts';
import type { listPublicInventoryRooms, listPublicInventoryBeds } from '@hsm/api-client';
import { Button } from './ui/button';
import { InventoryPhotoStrip } from './inventory-photo-strip';
type Room = Awaited<ReturnType<typeof listPublicInventoryRooms>>['data'][number];
type Bed = Awaited<ReturnType<typeof listPublicInventoryBeds>>['data'][number];
export function PublicInventoryRoomOptions({
  rows,
  beds,
  selectedRoom,
  whole,
  perBed,
  roomDisabled,
  bedDisabled,
  bedsPending,
  chooseRoom,
  chooseTarget,
}: {
  rows: Room[];
  beds: Bed[] | undefined;
  selectedRoom: Room | undefined;
  whole: boolean;
  perBed: boolean;
  roomDisabled: boolean;
  bedDisabled: boolean;
  bedsPending: boolean;
  chooseRoom: (id: string) => void;
  chooseTarget: (target: InventoryTarget) => void;
}) {
  return (
    <div className="space-y-4">
      {rows.map((room) => (
        <section
          key={'room:' + room.id}
          className="space-y-2 rounded-panel border border-hsm-border p-4"
        >
          <h3 className="font-semibold">Room {room.label}</h3>
          <InventoryPhotoStrip ids={room.photoIds} label={'Room ' + room.label} />
          {whole ? (
            <Button
              variant="secondary"
              disabled={roomDisabled || room.wholeRoomAvailable === false}
              onClick={() => chooseTarget({ kind: 'room', roomId: room.id })}
            >
              Quote whole room {room.label}
            </Button>
          ) : null}
          {whole && room.wholeRoomAvailable === false ? (
            <p>This whole-room option is unavailable.</p>
          ) : null}
          {perBed ? (
            <Button
              variant="secondary"
              aria-pressed={selectedRoom?.id === room.id}
              disabled={roomDisabled}
              onClick={() => chooseRoom(room.id)}
            >
              View beds in room {room.label}
            </Button>
          ) : null}
          {perBed && selectedRoom?.id === room.id ? (
            <div className="space-y-2">
              {bedsPending ? <p role="status">Loading beds…</p> : null}
              {beds?.length === 0 ? <p>No beds on this page.</p> : null}
              {beds?.map((bed) => (
                <div key={'bed:' + bed.id} className="space-y-2">
                  {bed.monthlyRentPaisa !== undefined && bed.monthlyRentPaisa !== null ? (
                    <p>{marketplacePrice(bed.monthlyRentPaisa)} / month</p>
                  ) : null}
                  {bed.depositPaisa !== undefined ? (
                    <p>Security {marketplacePrice(bed.depositPaisa)}</p>
                  ) : null}
                  <InventoryPhotoStrip ids={bed.photoIds} label={'Bed ' + bed.label} />
                  <Button
                    variant="secondary"
                    disabled={bedDisabled || bed.available === false}
                    onClick={() => chooseTarget({ kind: 'bed', roomId: room.id, bedId: bed.id })}
                  >
                    Quote room {room.label}, bed {bed.label}
                  </Button>
                  {bed.available === false ? (
                    <p>Bed {bed.label} is unavailable for these dates.</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
