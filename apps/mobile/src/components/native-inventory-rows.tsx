import { NativeBillingPolicy } from './native-billing-policy';
import { NativeInventoryPricing } from './inventory-pricing';
import { NativeInventoryPageControls } from './native-inventory-page-controls';
import type { NativeInventoryPaging } from './use-native-inventory-pages';
import { Text, View } from 'react-native';
import { marketplacePrice, type readBranchInventory } from '@hsm/api-client';
import { Copy } from './ui';
import { roomTypeFacts, roomTypeTitle } from '../lib/room-type-title';
import {
  BedDouble,
  ChevronDown,
  DoorOpen,
  Pencil,
  Receipt,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { IconChip, InvFact, StatusDot } from './inventory-tools';
const modeLabels: Record<string, string> = {
  per_bed: 'Per bed',
  whole_room: 'Whole room',
  both: 'Bed or room',
};
const sentence = (value: string) => {
  const text = value.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export type NativeInventorySelection = { kind: 'room' | 'seat'; id: string; label: string };
type Inventory = Awaited<ReturnType<typeof readBranchInventory>>;
export function NativeInventoryRows({
  actorId,
  branchId,
  data,
  canEdit,
  disabled,
  actionsDisabled = disabled,
  navigationDisabled,
  paging,
  onSelect,
}: {
  actorId: string;
  branchId: string;
  data: Inventory;
  canEdit: boolean;
  disabled: boolean;
  actionsDisabled?: boolean;
  navigationDisabled: boolean;
  paging: NativeInventoryPaging;
  onSelect: (selection: NativeInventorySelection) => void;
}) {
  return (
    <>
      {!data.roomTypes.length ? (
        <Copy>{paging.typeCursor ? 'No room types on this page' : 'No room types yet'}</Copy>
      ) : null}
      {data.roomTypes.map((type) => (
        <View key={type.id} className="gap-3 rounded-input border border-border p-4">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 font-heading text-body text-text">
              {roomTypeTitle(type)}
            </Text>
            {type.archivedAt ? <StatusDot status="archived" /> : null}
          </View>
          <InvFact Icon={Users}>
            {roomTypeFacts(type, modeLabels[type.inventoryMode] ?? type.inventoryMode)}
          </InvFact>
          {type.bedMonthlyRentPaisa !== null ? (
            <InvFact Icon={BedDouble}>
              {marketplacePrice(type.bedMonthlyRentPaisa)} / bed · month
            </InvFact>
          ) : null}
          {type.roomMonthlyRentPaisa !== null ? (
            <InvFact Icon={DoorOpen}>
              {marketplacePrice(type.roomMonthlyRentPaisa)} / room · month
            </InvFact>
          ) : null}
          <InvFact Icon={ShieldCheck}>{marketplacePrice(type.depositPaisa)} deposit</InvFact>
          {type.fees.map((fee) => (
            <InvFact key={fee.code + ':' + fee.cadence} Icon={Receipt}>
              {sentence(fee.code)} {marketplacePrice(fee.amountPaisa)} · {sentence(fee.cadence)}
            </InvFact>
          ))}
          <View className="flex-row flex-wrap gap-2">
            {!type.archivedAt ? (
              <NativeBillingPolicy
                actorId={actorId}
                target={{ branchId, roomTypeId: type.id }}
                roomTypeName={roomTypeTitle(type)}
                accessUnavailable={disabled}
              />
            ) : null}
            {!type.archivedAt ? (
              <NativeInventoryPricing
                actorId={actorId}
                branchId={branchId}
                type={type}
                canEdit={false}
                unavailable={disabled}
                blocked={navigationDisabled}
              />
            ) : null}
            {!type.archivedAt && paging.selectedTypeId !== type.id ? (
              <IconChip
                Icon={ChevronDown}
                text="Rooms"
                label={'View rooms for ' + roomTypeTitle(type)}
                disabled={navigationDisabled}
                onPress={() => paging.selectType(type.id)}
              />
            ) : null}
          </View>
          {paging.selectedTypeId === type.id && !data.rooms.length ? <Copy>No rooms</Copy> : null}
          {data.rooms
            .filter((room) => room.roomTypeId === type.id)
            .map((room) => (
              <View key={room.id} className="gap-2 border-t border-border pt-3">
                <View className="flex-row items-center gap-2">
                  <DoorOpen size={18} color={colors.primary} />
                  <Text className="font-heading text-body text-text">{room.label}</Text>
                  <View className="flex-1">
                    <StatusDot status={room.archivedAt ? 'archived' : room.status} />
                  </View>
                  {!room.archivedAt && paging.selectedRoomId !== room.id ? (
                    <IconChip
                      Icon={ChevronDown}
                      text="Beds"
                      label={'View beds in room ' + room.label}
                      disabled={navigationDisabled}
                      onPress={() => paging.selectRoom(room.id)}
                    />
                  ) : null}
                  {canEdit && !type.archivedAt && !room.archivedAt ? (
                    <IconChip
                      Icon={Pencil}
                      disabled={actionsDisabled}
                      label={'Change room ' + room.label + ' availability'}
                      onPress={() =>
                        onSelect({ kind: 'room', id: room.id, label: 'Room ' + room.label })
                      }
                    />
                  ) : null}
                </View>
                {paging.selectedRoomId === room.id && !room.seats.length ? (
                  <Copy>No beds</Copy>
                ) : null}
                {room.seats.map((seat) => (
                  <View key={seat.id} className="flex-row items-center gap-2 pl-6">
                    <BedDouble size={16} color={colors.secondary} />
                    <Text className="font-body text-sm text-text">
                      {seat.label} · #{seat.ordinal}
                    </Text>
                    <View className="flex-1">
                      <StatusDot status={seat.archivedAt ? 'archived' : seat.status} />
                    </View>
                    {canEdit && !type.archivedAt && !room.archivedAt && !seat.archivedAt ? (
                      <IconChip
                        Icon={Pencil}
                        disabled={actionsDisabled}
                        label={'Change bed ' + seat.label + ' in room ' + room.label}
                        onPress={() =>
                          onSelect({
                            kind: 'seat',
                            id: seat.id,
                            label: 'Room ' + room.label + ', bed ' + seat.label,
                          })
                        }
                      />
                    ) : null}
                  </View>
                ))}
                {paging.selectedRoomId === room.id ? (
                  <NativeInventoryPageControls
                    label="bed"
                    current={Boolean(paging.bedCursor)}
                    next={Boolean(paging.nextBedCursor)}
                    disabled={navigationDisabled}
                    onFirst={paging.firstBeds}
                    onNext={paging.nextBeds}
                  />
                ) : null}
              </View>
            ))}
          {paging.selectedTypeId === type.id ? (
            <NativeInventoryPageControls
              label="room"
              current={Boolean(paging.roomCursor)}
              next={Boolean(paging.nextRoomCursor)}
              disabled={navigationDisabled}
              onFirst={paging.firstRooms}
              onNext={paging.nextRooms}
            />
          ) : null}
        </View>
      ))}
      <NativeInventoryPageControls
        label="room type"
        current={Boolean(paging.typeCursor)}
        next={Boolean(paging.nextTypeCursor)}
        disabled={navigationDisabled}
        onFirst={paging.firstTypes}
        onNext={paging.nextTypes}
      />
    </>
  );
}
export function nativeInventorySelectionAvailable(
  data: Inventory,
  selection: NativeInventorySelection,
) {
  return data.rooms.some(
    (room) =>
      !room.archivedAt &&
      data.roomTypes.some((type) => type.id === room.roomTypeId && !type.archivedAt) &&
      (selection.kind === 'room'
        ? room.id === selection.id
        : room.seats.some((seat) => seat.id === selection.id && !seat.archivedAt)),
  );
}
