import { Skeleton } from '../loading/skeleton';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ApiFailure } from '@hsm/api-client';
import type { InventoryTarget, StayRange } from '@hsm/contracts';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { usePublicInventoryPages } from './use-public-inventory-pages';
import { PublicInventoryDates } from './inventory-dates';
import { PublicInventoryTypes } from './inventory-types';
import { PublicInventoryRoomOptions } from './inventory-room-options';
import { NativeInventoryPageControls } from '../native-inventory-page-controls';
import { MarketplaceAction } from './action';
import { MarketplaceQuote } from './quote';
import { safeMessage } from '../../lib/messages';
export function PublicInventoryOptions({
  branchId,
  actorId,
}: {
  branchId: string;
  actorId?: string;
}) {
  const [range, setRange] = useState<StayRange>(),
    [busy, setBusy] = useState(false);
  return (
    <View accessibilityLabel="Public room options" style={{ gap: metrics.lg }}>
      <PublicInventoryDates
        busy={busy}
        onApply={(value) => {
          if (!busy) setRange(value);
        }}
      />
      {range ? (
        <Text style={{ color: colors.secondary }}>
          {range.moveInDate} – {range.moveOutDate} · checkout day excluded
        </Text>
      ) : null}
      <Options
        key={JSON.stringify([branchId, actorId, range])}
        branchId={branchId}
        {...(actorId ? { actorId } : {})}
        {...(range ? { range } : {})}
        busy={busy}
        onBusy={setBusy}
      />
    </View>
  );
}
function Options({
  branchId,
  actorId,
  range,
  busy,
  onBusy,
}: {
  branchId: string;
  actorId?: string;
  range?: StayRange;
  busy: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const state = usePublicInventoryPages(branchId, range),
    cache = useQueryClient();
  const [target, setTarget] = useState<InventoryTarget>();
  const live =
    target &&
    state.type &&
    (target.kind === 'room'
      ? state.type.inventoryMode !== 'per_bed' &&
        state.rooms.data?.data.some(
          (row) => row.id === target.roomId && row.wholeRoomAvailable !== false,
        )
      : state.bedEnabled &&
        state.room?.id === target.roomId &&
        state.beds.data?.data.some((row) => row.id === target.bedId && row.available !== false));
  useEffect(() => {
    // Targets are selected only from loaded rows; a missing current parent is not a pending child read.
    if (target && (state.error || !live)) setTarget(undefined);
  }, [target, state.error, live]);
  useEffect(() => {
    if (state.error instanceof ApiFailure && state.error.code === 'NOT_FOUND')
      void cache.invalidateQueries({ queryKey: ['marketplace-details', branchId] });
  }, [state.error, cache, branchId]);
  function navigate(action: () => void) {
    if (!busy) {
      setTarget(undefined);
      action();
    }
  }
  function chooseTarget(value: InventoryTarget) {
    if (
      !busy &&
      !state.error &&
      !state.types.isFetching &&
      !state.rooms.isFetching &&
      (value.kind !== 'bed' || !state.beds.isFetching)
    )
      setTarget(value);
  }
  const rootDisabled = busy || state.types.isFetching,
    roomDisabled = rootDisabled || state.rooms.isFetching,
    bedDisabled = roomDisabled || state.beds.isFetching;
  if (state.error)
    return (
      <View style={{ gap: metrics.md }}>
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {safeMessage(state.error)}
        </Text>
        {state.typeCursor || state.roomCursor || state.bedCursor ? (
          <MarketplaceAction
            secondary
            label="Restore room option first pages"
            disabled={busy}
            onPress={() => navigate(state.firstTypes)}
          />
        ) : null}
      </View>
    );
  return (
    <View style={{ gap: metrics.lg }}>
      {state.types.isPending ? <Skeleton kind="inline" label="Loading room types…" /> : null}
      {state.types.data?.data.length === 0 ? (
        <Text style={{ color: colors.secondary }}>
          {state.typeCursor ? 'No room types on this page.' : 'No room options are published.'}
        </Text>
      ) : null}
      {state.types.data ? (
        <PublicInventoryTypes
          rows={state.types.data.data}
          disabled={rootDisabled}
          choose={(id) => navigate(() => state.chooseType(id))}
        />
      ) : null}
      <NativeInventoryPageControls
        label="room types"
        current={Boolean(state.typeCursor)}
        next={Boolean(state.types.data?.nextCursor)}
        disabled={rootDisabled}
        onFirst={() => navigate(state.firstTypes)}
        onNext={() => navigate(state.nextTypes)}
      />
      {state.type ? (
        <>
          <Text accessibilityRole="header" style={{ color: colors.heading }}>
            Rooms for {state.type.name}
          </Text>
          {state.rooms.isPending ? <Skeleton kind="table" label="Loading rooms…" /> : null}
          {state.rooms.data?.data.length === 0 ? (
            <Text style={{ color: colors.secondary }}>No rooms on this page.</Text>
          ) : null}
          {state.rooms.data ? (
            <PublicInventoryRoomOptions
              rows={state.rooms.data.data}
              beds={state.beds.data?.data}
              selectedRoom={state.room}
              whole={state.type.inventoryMode !== 'per_bed'}
              perBed={state.type.inventoryMode !== 'whole_room'}
              roomDisabled={roomDisabled}
              bedDisabled={bedDisabled}
              bedsPending={state.bedEnabled && state.beds.isPending}
              chooseRoom={(id) => navigate(() => state.chooseRoom(id))}
              chooseTarget={chooseTarget}
            />
          ) : null}
          <NativeInventoryPageControls
            label="rooms"
            current={Boolean(state.roomCursor)}
            next={Boolean(state.rooms.data?.nextCursor)}
            disabled={roomDisabled}
            onFirst={() => navigate(state.firstRooms)}
            onNext={() => navigate(state.nextRooms)}
          />
          {state.bedEnabled ? (
            <NativeInventoryPageControls
              label="beds"
              current={Boolean(state.bedCursor)}
              next={Boolean(state.beds.data?.nextCursor)}
              disabled={bedDisabled}
              onFirst={() => navigate(state.firstBeds)}
              onNext={() => navigate(state.nextBeds)}
            />
          ) : null}
        </>
      ) : null}
      {target && live ? (
        <MarketplaceQuote
          key={JSON.stringify([target, range])}
          branchId={branchId}
          target={target}
          {...(actorId ? { actorId } : {})}
          {...(range ? { initialRange: range } : {})}
          onBusy={onBusy}
        />
      ) : null}
    </View>
  );
}
