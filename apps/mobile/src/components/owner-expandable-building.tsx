import { occupiedInRooms } from '../lib/property-occupancy';
import { Pressable, Text, View } from 'react-native';
import { Building2, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useExpansion } from './use-expansion';
import { PropertyActions } from './property-actions';
import { OwnerFloorGrid } from './owner-floor-grid';
import { mobileColors, mobileOwnerColors as c, ownerMetrics as m, mobileSurfaces } from '@hsm/ui';
import type { FloorRooms } from './use-floor-rooms';
import { SetupText } from './owner-wizard-ui';
import { Skeleton } from './loading/skeleton';
import { openRoomsLevel } from './owner-setup-nav';

const count = (value: number, word: string) => value + ' ' + word + (value === 1 ? '' : 's');
export function OwnerExpandableBuilding({
  brandId,
  group,
  data,
  canEdit,
}: {
  brandId: string;
  group: FloorRooms['floors'][number];
  data: FloorRooms;
  canEdit: boolean;
}) {
  const { expanded, toggle } = useExpansion();
  const Chevron = expanded ? ChevronUp : ChevronDown;
  const rooms = data.rooms.filter((room) =>
    group.floors.some((floor) => data.floorOf(room.id)?.floor?.id === floor.id),
  );
  const beds = rooms.flatMap((room) => room.seats.filter((seat) => !seat.archivedAt));
  const pending = group.query?.isPending || data.locationsLoading || data.inventory.isPending;
  const canSeeStays = Boolean(data.inventory.data?.permissions.includes('stay_manage'));
  return (
    <View
      style={{
        ...mobileSurfaces.icyCard,
        borderWidth: 1,
        borderRadius: m.cardRadius,
        padding: m.gap,
        gap: m.smallGap,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={group.building.name}
          accessibilityState={{ expanded }}
          onPress={toggle}
          style={{
            flex: 1,
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
            <Building2 size={30} color={c.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              className="font-heading"
              style={{ color: c.heading, fontSize: m.title - 4, fontWeight: '700' }}
            >
              {group.building.name}
            </Text>
            {data.locationsError || data.inventory.error || group.query?.error ? (
              <SetupText alert>Room counts unavailable</SetupText>
            ) : pending ? (
              <Skeleton kind="inline" label="Loading building counts" />
            ) : (
              <SetupText muted>
                {[
                  count(group.floors.length, 'floor'),
                  count(rooms.length, 'room'),
                  count(beds.length, 'bed'),
                  // Occupancy appears only for staff who may see stays.
                  ...(canSeeStays && data.occupancy?.data
                    ? [
                        occupiedInRooms(
                          data.occupancy.data,
                          rooms.map((room) => room.id),
                        ) + ' occupied',
                      ]
                    : []),
                ].join(' · ')}
              </SetupText>
            )}
            {canSeeStays && data.occupancy?.isError ? (
              <SetupText alert>Occupancy unavailable</SetupText>
            ) : null}
          </View>
          <Chevron size={28} color={c.primary} />
        </Pressable>
        {canEdit ? (
          <PropertyActions
            data={data}
            name={group.building.name}
            kind="building"
            id={group.building.id}
            label={'building ' + group.building.name}
            version={group.building.version}
          />
        ) : null}
      </View>
      {/* Expanded: the floors as cards; each opens its own floor screen. */}
      {expanded ? (
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
          open={(floor) =>
            openRoomsLevel(brandId, { buildingId: group.building.id, floorId: floor.id })
          }
          detail={(floor) => {
            const count = data.rooms.filter(
              (room) => data.floorOf(room.id)?.floor?.id === floor.id,
            ).length;
            return count + (count === 1 ? ' room' : ' rooms');
          }}
          busy={data.command.isPending || data.command.unresolved}
          add={
            canEdit
              ? () => openRoomsLevel(brandId, { buildingId: group.building.id, add: 'floor' })
              : undefined
          }
        />
      ) : null}
    </View>
  );
}
