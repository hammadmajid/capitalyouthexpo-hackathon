'use client';
import { useState } from 'react';
import { ApiFailure } from '@hsm/api-client';
import type { InventoryBlockInput } from '@hsm/contracts';
import { InventoryBlockForm } from './inventory-block-form';
import { InventoryPageControls } from './inventory-page-controls';
import { usePagedInventory } from './use-paged-inventory';
import { inventoryScopeDenied } from './use-branch-inventory';
import { Button } from './ui/button';
import { errorMessage } from '../lib/messages';
export function InventoryBlockPagedForm({
  actorId,
  branchId,
  pending,
  disabled,
  onSave,
  onCancel,
}: {
  actorId: string;
  branchId: string;
  pending: boolean;
  disabled: boolean;
  onSave: (input: InventoryBlockInput) => void;
  onCancel: () => void;
}) {
  const { query, paging } = usePagedInventory(actorId, branchId);
  const [roomRevision, setRooms] = useState(0),
    [bedRevision, setBeds] = useState(0);
  const unavailable =
    disabled ||
    query.isError ||
    query.isFetching ||
    !query.data?.permissions.includes('block_manage');
  function navigate(action: () => void, bedsOnly = false) {
    if (pending || query.isFetching) return;
    if (bedsOnly) setBeds((value) => value + 1);
    else setRooms((value) => value + 1);
    action();
  }
  const navigation = pending || query.isFetching || disabled;
  if (
    inventoryScopeDenied(query.error) ||
    (query.error instanceof ApiFailure && query.error.code === 'NOT_FOUND')
  )
    return (
      <section aria-label="Block target inventory" className="space-y-3">
        <p role="alert">{errorMessage(query.error)}</p>
        <Button
          variant="secondary"
          disabled={pending || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Retry block target inventory
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel block edit
        </Button>
      </section>
    );
  return (
    <section aria-label="Block target inventory" className="space-y-3">
      {query.isPending ? <p role="status">Loading block target inventory…</p> : null}
      {query.isError ? (
        <div>
          <p role="alert">Block target inventory is unavailable. {errorMessage(query.error)}</p>
          <Button variant="secondary" disabled={navigation} onClick={() => void query.refetch()}>
            Retry block target inventory
          </Button>
          {paging.typeCursor || paging.roomCursor || paging.bedCursor ? (
            <Button
              variant="secondary"
              disabled={navigation}
              onClick={() => navigate(paging.firstTypes)}
            >
              Restore block target first pages
            </Button>
          ) : null}
        </div>
      ) : null}
      {query.data ? (
        <>
          <label className="field-label">
            Block room type
            <select
              className="field-input"
              disabled={navigation || query.isError}
              value={paging.selectedTypeId ?? ''}
              onChange={(event) => navigate(() => paging.selectType(event.target.value))}
            >
              {!query.data.roomTypes.length ? (
                <option value="">No room types on this page</option>
              ) : null}
              {query.data.roomTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <InventoryPageControls
            label="block room types"
            current={Boolean(paging.typeCursor)}
            next={Boolean(paging.nextTypeCursor)}
            disabled={navigation || query.isError}
            onFirst={() => navigate(paging.firstTypes)}
            onNext={() => navigate(paging.nextTypes)}
          />
          <InventoryPageControls
            label="block rooms"
            current={Boolean(paging.roomCursor)}
            next={Boolean(paging.nextRoomCursor)}
            disabled={navigation || query.isError}
            onFirst={() => navigate(paging.firstRooms)}
            onNext={() => navigate(paging.nextRooms)}
          />
          <InventoryPageControls
            label="block beds"
            current={Boolean(paging.bedCursor)}
            next={Boolean(paging.nextBedCursor)}
            disabled={navigation || query.isError}
            onFirst={() => navigate(paging.firstBeds, true)}
            onNext={() => navigate(paging.nextBeds, true)}
          />
          {!query.data.rooms.length ? (
            <p>No rooms on this page. Choose another room type or page.</p>
          ) : null}
        </>
      ) : null}
      <InventoryBlockForm
        rooms={query.data?.rooms ?? []}
        pending={pending}
        disabled={unavailable}
        roomRevision={roomRevision}
        bedRevision={bedRevision}
        onRoomChange={paging.selectRoom}
        onSave={(input) => {
          if (!unavailable && !pending) onSave(input);
        }}
        onCancel={onCancel}
      />
    </section>
  );
}
