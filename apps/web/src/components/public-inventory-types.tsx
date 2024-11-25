import { marketplacePrice, type listPublicInventoryRoomTypes } from '@hsm/api-client';
import { Button } from './ui/button';
type Type = Awaited<ReturnType<typeof listPublicInventoryRoomTypes>>['data'][number];
export function PublicInventoryTypes({
  rows,
  selectedId,
  disabled,
  choose,
}: {
  rows: Type[];
  selectedId: string | undefined;
  disabled: boolean;
  choose: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {rows.map((type) => (
        <section
          key={'type:' + type.id}
          className="space-y-3 rounded-panel border border-hsm-border bg-hsm-surface p-4"
        >
          <h2 className="text-xl font-semibold">{type.name}</h2>
          <p>{type.capacity}-seater accommodation</p>
          {type.amenities.length ? (
            <ul aria-label={'Amenities for ' + type.name} className="flex flex-wrap gap-2">
              {type.amenities.map((amenity) => (
                <li key={amenity.code} className="rounded-input bg-hsm-icy p-2 text-hsm-primary">
                  {amenity.name}
                </li>
              ))}
            </ul>
          ) : (
            <p>No published room amenities.</p>
          )}
          {type.inventoryMode !== 'whole_room' && type.bedMonthlyRentPaisa !== null ? (
            <p>Per bed: {marketplacePrice(type.bedMonthlyRentPaisa)} / month</p>
          ) : null}
          {type.inventoryMode !== 'per_bed' && type.roomMonthlyRentPaisa !== null ? (
            <p>Whole room: {marketplacePrice(type.roomMonthlyRentPaisa)} / month</p>
          ) : null}
          <p>
            {type.inventoryMode === 'both'
              ? 'Whole-room security'
              : type.inventoryMode === 'per_bed'
                ? 'Security from'
                : 'Security'}
            : {marketplacePrice(type.depositPaisa)}
          </p>
          <Button
            variant="secondary"
            aria-pressed={selectedId === type.id}
            disabled={disabled}
            onClick={() => choose(type.id)}
          >
            View rooms for {type.name}
          </Button>
        </section>
      ))}
    </div>
  );
}
