import { Skeleton } from '../loading/skeleton';
import { Text, View } from 'react-native';
import type { InventoryTarget } from '@hsm/contracts';
import type { listPublicInventoryRooms, listPublicInventoryBeds } from '@hsm/api-client';
import { marketplacePrice } from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { MarketplaceAction } from './action';
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
    <View style={{ gap: metrics.lg }}>
      {rows.map((room) => (
        <View key={room.id} style={{ gap: metrics.sm }}>
          <Text accessibilityRole="header" style={{ color: colors.heading }}>
            Room {room.label}
          </Text>
          {room.capacity !== undefined ? (
            <Text style={{ color: colors.secondary }}>{room.capacity}-bed room</Text>
          ) : null}
          <InventoryPhotoStrip ids={room.photoIds} label={'Room ' + room.label} />
          {whole ? (
            <MarketplaceAction
              secondary
              label={'Quote whole room ' + room.label}
              disabled={roomDisabled || room.wholeRoomAvailable === false}
              onPress={() => chooseTarget({ kind: 'room', roomId: room.id })}
            />
          ) : null}
          {whole && room.wholeRoomAvailable === false ? (
            <Text style={{ color: colors.secondary }}>This whole-room option is unavailable.</Text>
          ) : null}
          {perBed ? (
            <MarketplaceAction
              secondary
              label={'View beds in room ' + room.label}
              disabled={roomDisabled}
              onPress={() => chooseRoom(room.id)}
            />
          ) : null}
          {perBed && selectedRoom?.id === room.id ? (
            <View style={{ gap: metrics.sm }}>
              {bedsPending ? <Skeleton kind="table" label="Loading beds…" /> : null}
              {beds?.length === 0 ? (
                <Text style={{ color: colors.secondary }}>No beds on this page.</Text>
              ) : null}
              {beds?.map((bed) => (
                <View key={bed.id} style={{ gap: metrics.sm }}>
                  {bed.monthlyRentPaisa !== undefined && bed.monthlyRentPaisa !== null ? (
                    <Text style={{ color: colors.heading, fontWeight: '700' }}>
                      {marketplacePrice(bed.monthlyRentPaisa)} / month
                    </Text>
                  ) : null}
                  {bed.depositPaisa !== undefined ? (
                    <Text style={{ color: colors.secondary }}>
                      Security {marketplacePrice(bed.depositPaisa)}
                    </Text>
                  ) : null}
                  <InventoryPhotoStrip ids={bed.photoIds} label={'Bed ' + bed.label} />
                  <MarketplaceAction
                    secondary
                    label={'Quote room ' + room.label + ', bed ' + bed.label}
                    disabled={bedDisabled || bed.available === false}
                    onPress={() => chooseTarget({ kind: 'bed', roomId: room.id, bedId: bed.id })}
                  />
                  {bed.available === false ? (
                    <Text style={{ color: colors.secondary }}>
                      Bed {bed.label} is unavailable for these dates.
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
