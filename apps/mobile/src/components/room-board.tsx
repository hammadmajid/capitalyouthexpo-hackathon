import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Building2, ChevronDown, ChevronUp, Layers } from 'lucide-react-native';
import { mobileOwnerColors as c, mobileSurfaces, ownerMetrics as m } from '@hsm/ui';
import { safeMessage } from '../lib/messages';
import { Skeleton } from './loading/skeleton';
import { Button, Copy } from './ui';
import { BoardSelect } from './board-select';
import { BedSheet } from './bed-sheet';
import { useBedBoard } from './use-bed-board';
import { BoardLegend, BoardStatsRow, RoomCard, SectionBar } from './bed-board-parts';
import {
  boardBuildings,
  boardFloors,
  boardStats,
  filteredRooms,
  groupBoard,
  type BoardGroup,
  type BoardRoom,
} from './bed-board-model';
const gap = 10;
// One room per row on phones; wider screens (tablet, desktop web) use two or three columns.
function columnsFor(width: number) {
  if (width >= 1000) return 3;
  return width >= 640 ? 2 : 1;
}
// CHG-048 / BED-001: the Rooms & rent home. Every number and colour comes from the live
// occupancy read; the server re-checks branch scope on each call (Owner: own hostels,
// Manager: assigned branches only).
export function RoomBoard(props: { actorId: string; branchId: string }) {
  const board = useBedBoard(props.actorId, props.branchId);
  const [chosen, setBuilding] = useState<string | null>();
  const [floor, setFloor] = useState<string>();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<{ roomId: string; bedId: string }>();
  if (board.isPending) return <Skeleton kind="table" label="Loading beds…" />;
  if (!board.data)
    return (
      <View style={{ gap: m.smallGap }}>
        <Copy alert>{safeMessage(board.error)}</Copy>
        <Button label="Try again" onPress={() => void board.refetch()} />
      </View>
    );
  const rooms = board.data.rooms;
  // null = "All Buildings" chosen; undefined = not chosen yet, so the first building shows.
  const building = chosen === null ? undefined : (chosen ?? boardBuildings(rooms)[0]?.id);
  const filter = { building, floor };
  const groups = groupBoard(rooms, filter);
  const stats = boardStats(filteredRooms(rooms, filter));
  const columns = columnsFor(width);
  const cardWidth = width ? (width - gap * (columns - 1)) / columns : undefined;
  const room = picked && rooms.find((item) => item.id === picked.roomId);
  const bed = room?.beds.find((item) => item.id === picked?.bedId);
  return (
    <View style={{ gap: m.gap }} accessibilityLabel="Bed Board">
      <View style={styles.filters}>
        <BoardSelect
          label="Building"
          Icon={Building2}
          allLabel="All Buildings"
          value={building}
          options={boardBuildings(rooms)}
          onChange={(value) => {
            setBuilding(value ?? null);
            setFloor(undefined);
          }}
        />
        <BoardSelect
          label="Floor"
          Icon={Layers}
          allLabel="All Floors"
          value={floor}
          options={boardFloors(rooms, building)}
          onChange={setFloor}
        />
      </View>
      <BoardStatsRow stats={stats} />
      {board.error ? <Copy alert>Could not refresh · showing the last loaded beds</Copy> : null}
      {board.data.complete ? null : <Copy alert>Showing the first 1,000 rooms</Copy>}
      {groups.length === 0 ? <Copy>No rooms yet · add them in Hostel Setup</Copy> : null}
      {groups.map((group, index) => (
        <BuildingSection
          legend={index === groups.length - 1 ? <BoardLegend finance={stats.finance} /> : undefined}
          key={group.building.id}
          group={group}
          closed={collapsed.includes(group.building.id)}
          toggle={() =>
            setCollapsed((list) =>
              list.includes(group.building.id)
                ? list.filter((id) => id !== group.building.id)
                : [...list, group.building.id],
            )
          }
          cardWidth={cardWidth}
          onWidth={setWidth}
          onBed={(roomId, bedId) => setPicked({ roomId, bedId })}
        />
      ))}
      {room && bed ? (
        <BedSheet
          actorId={props.actorId}
          branchId={props.branchId}
          room={room}
          bed={bed}
          onClose={() => setPicked(undefined)}
        />
      ) : null}
    </View>
  );
}
// One collapsible building card: floor bars, then room cards (one per row on phones).
function BuildingSection(props: {
  group: BoardGroup;
  closed: boolean;
  toggle: () => void;
  cardWidth: number | undefined;
  onWidth: (width: number) => void;
  onBed: (roomId: string, bedId: string) => void;
  legend?: ReactNode;
}) {
  const { group, closed, cardWidth } = props;
  const Chevron = closed ? ChevronDown : ChevronUp;
  return (
    <View style={styles.building}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !closed }}
        accessibilityLabel={group.building.name}
        onPress={props.toggle}
        style={styles.buildingHead}
      >
        <Building2 size={30} color={c.primary} />
        <Text className="font-heading" numberOfLines={1} style={styles.buildingName}>
          {group.building.name}
        </Text>
        <Chevron size={26} color={c.heading} />
      </Pressable>
      {closed
        ? null
        : group.floors.map((row) => (
            <View key={row.floor.id} style={{ gap }}>
              <SectionBar Icon={Layers} title={row.floor.name} />
              <View
                style={styles.grid}
                onLayout={(event) => props.onWidth(Math.floor(event.nativeEvent.layout.width))}
              >
                {row.rooms.map((item: BoardRoom) => (
                  <View key={item.id} style={cardWidth ? { width: cardWidth } : styles.full}>
                    <RoomCard room={item} onBed={(bedId) => props.onBed(item.id, bedId)} />
                  </View>
                ))}
              </View>
            </View>
          ))}
      {closed ? null : props.legend}
    </View>
  );
}
const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 10 },
  building: {
    ...mobileSurfaces.icyCard,
    borderWidth: 1,
    borderRadius: m.cardRadius,
    padding: 12,
    gap: 12,
  },
  buildingHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: m.touch },
  buildingName: { flex: 1, color: c.heading, fontSize: m.title, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap },
  full: { width: '100%' },
});
