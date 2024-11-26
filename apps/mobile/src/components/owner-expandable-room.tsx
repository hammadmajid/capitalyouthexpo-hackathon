import { PropertyActions } from './property-actions';
import { canEditInventory } from './owner-floor-rooms';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, DoorOpen } from 'lucide-react-native';
import { mobileColors, mobileOwnerColors as c, ownerMetrics as m, mobileSurfaces } from '@hsm/ui';
import { SetupText } from './owner-wizard-ui';
import { openRoomsLevel } from './owner-setup-nav';
import type { FloorRooms } from './use-floor-rooms';

// BRN-001 / ROOM-002: a room card opens the room's own screen (beds, photos, amenities)
// instead of expanding inline, so the floor list stays short.
export function OwnerExpandableRoom({
  brandId,
  buildingId,
  floorId,
  room,
  data,
}: {
  data: FloorRooms;
  brandId: string;
  buildingId: string;
  floorId: string;
  room: FloorRooms['rooms'][number];
}) {
  const beds = room.seats.filter((bed) => !bed.archivedAt);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Room ' + room.label}
          onPress={() => openRoomsLevel(brandId, { buildingId, floorId, roomId: room.id })}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <View
            style={{
              ...mobileSurfaces.icyCard,
              borderWidth: 1,
              borderRadius: m.cardRadius,
              padding: m.gap,
              flexDirection: 'row',
              alignItems: 'center',
              gap: m.smallGap,
              minHeight: m.touch,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: mobileColors.aqua,
              }}
            >
              <DoorOpen size={30} color={c.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                className="font-heading"
                style={{ color: c.heading, fontSize: m.title - 4, fontWeight: '700' }}
              >
                Room {room.label}
              </Text>
              <SetupText muted>
                {beds.length} {beds.length === 1 ? 'bed' : 'beds'}
              </SetupText>
            </View>
            <ChevronRight size={28} color={c.primary} />
          </View>
        </Pressable>
      </View>
      {canEditInventory(data) ? (
        <PropertyActions
          data={data}
          name={room.label}
          kind="room"
          id={room.id}
          label={'room ' + room.label}
        />
      ) : null}
    </View>
  );
}
