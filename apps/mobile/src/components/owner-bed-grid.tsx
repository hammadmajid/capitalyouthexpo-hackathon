import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BedSingle, Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { marketplacePrice, readBranchOccupancy } from '@hsm/api-client';
import { PropertyActions } from './property-actions';
import { canEditInventory } from './owner-floor-rooms';
import { BedRent } from './bed-rent';
import { mobileColors, mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { AppHeader } from './navigation/header';
import { OwnerMediaGallery } from './owner-media-gallery';
import { NativeBedDetail } from './bed-detail';
import { Skeleton } from './loading/skeleton';
import { SetupText } from './owner-wizard-ui';
import type { FloorRooms } from './use-floor-rooms';
import { bedStatusText, bedTone, toneLabel } from './bed-board-model';
const bedStates: Record<string, string> = {
  available: 'Vacant',
  occupied: 'Occupied',
  reserved: 'Reserved',
  blocked: 'Blocked',
  unavailable: 'Off',
};
// BED-001 / CHG-048: colors describe occupancy and rent; green only for a paid invoice.
export function OwnerBedGrid(props: {
  actorId: string;
  data: FloorRooms;
  room: FloorRooms['rooms'][number];
  add?: (() => void) | undefined;
  onSelect?: ((open: boolean) => void) | undefined;
}) {
  const [selected, setSelectedState] = useState<string>();
  const setSelected = (id: string | undefined) => {
    setSelectedState(id);
    props.onSelect?.(id !== undefined);
  };
  const canRead = props.data.inventory.data?.permissions.includes('stay_manage') ?? false;
  const query = useQuery({
    queryKey: ['bed-board', props.actorId, props.data.branchId, 'room', props.room.id],
    enabled: canRead,
    retry: false,
    queryFn: async () =>
      readBranchOccupancy(await actorClient(props.actorId), props.data.branchId, {
        roomId: props.room.id,
        limit: 1,
      }),
  });
  if (selected && !canRead)
    return (
      <View style={{ gap: m.smallGap }}>
        <AppHeader
          title="Bed details"
          backLabel="Back to beds"
          onBack={() => setSelected(undefined)}
        />
        <BedRent actorId={props.actorId} branchId={props.data.branchId} bedId={selected} />
        <OwnerMediaGallery
          key={selected}
          actorId={props.actorId}
          branchId={props.data.branchId}
          roomId={props.room.id}
          bedId={selected}
          title="Bed photos"
        />
      </View>
    );
  if (selected)
    return (
      <NativeBedDetail
        key={selected}
        actorId={props.actorId}
        branchId={props.data.branchId}
        bedId={selected}
        on=""
        close={() => setSelected(undefined)}
        inRoom
      />
    );
  const beds = props.room.seats.filter((bed) => !bed.archivedAt);
  const live = query.data?.data.find((room) => room.id === props.room.id)?.beds;
  return (
    <View style={{ gap: m.smallGap }}>
      {canRead && query.isPending ? <Skeleton kind="inline" label="Loading bed status" /> : null}
      {query.isError ? <SetupText alert>{safeMessage(query.error)}</SetupText> : null}
      <View style={styles.grid}>
        {beds.map((bed) => {
          const actual = live?.find((item) => item.id === bed.id);
          // CHG-048: the same colour rule as the Bed Board (green only for paid).
          const tone = actual ? bedTone(actual) : undefined;
          const overdue = tone === 'overdue';
          const clear = tone === 'paid';
          const color = overdue
            ? c.danger
            : clear
              ? c.primary
              : tone === 'due'
                ? c.warning
                : c.secondary;
          const status = actual ? bedStatusText(actual) : bed.status;
          return (
            <View key={bed.id} style={{ alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Bed ' + bed.label + ', ' + status}
                onPress={() => setSelected(bed.id)}
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
              >
                <View
                  style={[
                    styles.tile,
                    {
                      borderColor: color,
                      backgroundColor: overdue
                        ? c.dangerSoft
                        : clear
                          ? c.primarySoft
                          : tone === 'due'
                            ? c.dueSurface
                            : c.surface,
                    },
                  ]}
                >
                  <BedSingle size={30} color={color} />
                  <Text numberOfLines={1} style={[styles.label, { color }]}>
                    {bed.label}
                  </Text>
                  {bed.monthlyRentPaisa !== undefined && bed.monthlyRentPaisa !== null ? (
                    <Text style={{ color: c.secondary, fontSize: 11, fontWeight: '700' }}>
                      {marketplacePrice(bed.monthlyRentPaisa)}
                    </Text>
                  ) : null}
                  {actual ? (
                    <Text numberOfLines={1} style={[styles.status, { color }]}>
                      {tone && tone !== 'occupied' && tone !== 'held'
                        ? toneLabel[tone]
                        : (bedStates[actual.state] ?? actual.state)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {canEditInventory(props.data) ? (
                <PropertyActions
                  data={props.data}
                  name={bed.label}
                  kind="seat"
                  id={bed.id}
                  label={'bed ' + bed.label}
                />
              ) : null}
            </View>
          );
        })}
        {props.add ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add bed"
            accessibilityState={{
              disabled: props.data.command.isPending || props.data.command.unresolved,
            }}
            disabled={props.data.command.isPending || props.data.command.unresolved}
            onPress={props.add}
          >
            <View style={[styles.tile, { borderColor: mobileColors.cardBorder }]}>
              <Plus size={30} color={c.primary} />
              <Text style={[styles.label, { color: c.primary }]}>Add bed</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: m.smallGap },
  tile: {
    width: 112,
    minHeight: 128,
    borderWidth: 1,
    borderColor: mobileColors.cardBorder,
    borderRadius: m.inputRadius,
    backgroundColor: c.surface,
    padding: m.smallGap,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: m.body, fontWeight: '600' },
  status: { fontSize: m.small, fontWeight: '600' },
});
