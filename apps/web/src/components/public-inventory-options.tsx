import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiFailure } from '@hsm/api-client';
import type { InventoryTarget, StayRange } from '@hsm/contracts';
import { PublicInventoryDateFilter } from './public-inventory-date-filter';
import { PublicInventoryTypes } from './public-inventory-types';
import { PublicInventoryRoomOptions } from './public-inventory-room-options';
import { InventoryPageControls } from './inventory-page-controls';
import { MarketplaceQuote } from './marketplace-quote';
import { usePublicInventoryPages } from './use-public-inventory-pages';
import { Button } from './ui/button';
import { errorMessage } from '../lib/messages';
export function PublicInventoryOptions({ branchId }: { branchId: string }) {
  const [range, setRange] = useState<StayRange>(),
    [busy, setBusy] = useState(false);
  return (
    <section aria-label="Public room options" className="space-y-4">
      <PublicInventoryDateFilter
        busy={busy}
        onApply={(value) => {
          if (!busy) setRange(value);
        }}
      />
      <p>
        {range
          ? `Availability from ${range.moveInDate} until ${range.moveOutDate} (end excluded).`
          : 'Choose stay dates to check real availability.'}
      </p>
      <Options
        key={JSON.stringify([branchId, range])}
        branchId={branchId}
        {...(range ? { range } : {})}
        busy={busy}
        onBusy={setBusy}
      />
    </section>
  );
}
function Options({
  branchId,
  range,
  busy,
  onBusy,
}: {
  branchId: string;
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
  const rootDisabled = busy || state.types.isFetching;
  const roomDisabled = rootDisabled || state.rooms.isFetching;
  const bedDisabled = roomDisabled || state.beds.isFetching;
  if (state.error)
    return (
      <div className="space-y-3">
        <p role="alert">{errorMessage(state.error)}</p>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setTarget(undefined);
            void state.retry();
          }}
        >
          Retry room options
        </Button>
        {state.typeCursor || state.roomCursor || state.bedCursor ? (
          <Button variant="secondary" disabled={busy} onClick={() => navigate(state.firstTypes)}>
            Restore room option first pages
          </Button>
        ) : null}
      </div>
    );
  return (
    <div className="space-y-4">
      {state.types.isPending ? <p role="status">Loading room types…</p> : null}
      {state.types.data?.data.length === 0 ? (
        <p>{state.typeCursor ? 'No room types on this page.' : 'No room options are published.'}</p>
      ) : null}
      {state.types.data ? (
        <PublicInventoryTypes
          rows={state.types.data.data}
          selectedId={state.type?.id}
          disabled={rootDisabled}
          choose={(id) => navigate(() => state.chooseType(id))}
        />
      ) : null}
      <InventoryPageControls
        label="room types"
        current={Boolean(state.typeCursor)}
        next={Boolean(state.types.data?.nextCursor)}
        disabled={rootDisabled}
        onFirst={() => navigate(state.firstTypes)}
        onNext={() => navigate(state.nextTypes)}
      />
      {state.type ? (
        <>
          <h2 className="text-xl font-semibold">Rooms for {state.type.name}</h2>
          {state.rooms.isPending ? <p role="status">Loading rooms…</p> : null}
          {state.rooms.data?.data.length === 0 ? <p>No rooms on this page.</p> : null}
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
          <InventoryPageControls
            label="rooms"
            current={Boolean(state.roomCursor)}
            next={Boolean(state.rooms.data?.nextCursor)}
            disabled={roomDisabled}
            onFirst={() => navigate(state.firstRooms)}
            onNext={() => navigate(state.nextRooms)}
          />
          {state.bedEnabled ? (
            <InventoryPageControls
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
          {...(range ? { initialRange: range } : {})}
          onBusy={onBusy}
        />
      ) : null}
    </div>
  );
}
