'use client';
import { marketplacePrice } from '@hsm/api-client';
import { InventoryRoomList } from './inventory-room-list';
import { InventoryPageControls } from './inventory-page-controls';
import { BookingPolicySettings } from './booking-policy-settings';
import { PaymentInstructionsSettings } from './payment-instructions-settings';
import { BillingPolicySettings } from './billing-policy-settings';
import { useBranchInventory, inventoryScopeDenied } from './use-branch-inventory';
import { useInventoryNavigationLocked } from './inventory-navigation';
import type { InventoryEditor } from './inventory-editor-state';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { RoomTypeEditor } from './room-type-editor';
import { RoomTypeAmenities } from './room-type-amenities';
import { PhysicalInventoryEditor, InventoryLifecycleEditor } from './inventory-physical-editor';
import { RoomDuplication } from './room-duplication';
import { InventoryImport } from './inventory-import';
import { InventoryPricing } from './inventory-pricing';
type Resource = 'room_type' | 'room' | 'seat';
export function InventoryBody({
  actorId,
  branchId,
  state,
  editor,
  open,
  close,
}: {
  actorId: string;
  branchId: string;
  state: ReturnType<typeof useBranchInventory>;
  editor: InventoryEditor | undefined;
  open: (value: InventoryEditor) => void;
  close: () => void;
}) {
  const { query, mutation, paging } = state;
  const locked = useInventoryNavigationLocked();
  const unavailable = query.isError || query.isFetching || locked;
  function save(command: Parameters<typeof mutation.mutate>[0]) {
    if (!unavailable && !mutation.isPending) mutation.mutate(command);
  }
  const data = query.data;
  const denied = inventoryScopeDenied(query.error) || inventoryScopeDenied(mutation.error);
  if (!data && query.isPending) return <p role="status">Loading physical inventory…</p>;
  if (!data || denied)
    return (
      <div>
        <p role="alert">
          {errorMessage(inventoryScopeDenied(mutation.error) ? mutation.error : query.error)}
        </p>
        {!denied && (paging.typeCursor || paging.roomCursor || paging.bedCursor) ? (
          <Button
            variant="secondary"
            disabled={locked || mutation.isPending || query.isFetching}
            onClick={paging.firstTypes}
          >
            Restore inventory first pages
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={() => {
            mutation.reset();
            close();
            void query.refetch();
          }}
        >
          Retry inventory
        </Button>
      </div>
    );
  const edit = data.permissions.includes('inventory_edit');
  const prices = edit && data.permissions.includes('pricing_edit'),
    pending = mutation.isPending;
  const navigationDisabled = pending || Boolean(editor) || unavailable;
  const initial =
    editor?.mode === 'type' && editor.id
      ? data.roomTypes.find((type) => type.id === editor.id)
      : undefined;
  const editorAvailable =
    !editor ||
    (editor.mode === 'type' && (!editor.id || initial !== undefined)) ||
    (editor.mode === 'room' && data.roomTypes.some((type) => !type.archivedAt)) ||
    (editor.mode === 'seat' &&
      data.rooms.some((room) => room.id === editor.roomId && !room.archivedAt)) ||
    (editor.mode === 'lifecycle' &&
      (editor.resource === 'room_type'
        ? data.roomTypes.some((type) => type.id === editor.id && !type.archivedAt)
        : editor.resource === 'room'
          ? data.rooms.some((room) => room.id === editor.id && !room.archivedAt)
          : data.rooms.some(
              (room) =>
                !room.archivedAt &&
                room.seats.some((seat) => seat.id === editor.id && !seat.archivedAt),
            )));
  function lifecycle(resource: Resource, id: string, label: string, archive: boolean) {
    open({ mode: 'lifecycle', resource, id, label, archive });
  }
  return (
    <section className="space-y-4" aria-label="Physical branch inventory">
      <h2 className="text-xl font-semibold">Rooms, beds and prices</h2>
      {query.isError ? (
        <div className="space-y-2">
          <p role="alert">
            Inventory could not refresh. Displayed values may be out of date; your entered changes
            are retained.
          </p>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Retry inventory
          </Button>
        </div>
      ) : null}
      {!edit ? (
        <p>Your current role can view inventory. Editing requires an explicit inventory grant.</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {prices ? (
          <Button disabled={pending || unavailable} onClick={() => open({ mode: 'type' })}>
            Create room type
          </Button>
        ) : null}
        {edit ? (
          <Button
            variant="secondary"
            disabled={pending || unavailable || !data.roomTypes.some((type) => !type.archivedAt)}
            onClick={() => open({ mode: 'room' })}
          >
            Add room
          </Button>
        ) : null}
      </div>
      {edit ? (
        <RoomDuplication
          actorId={actorId}
          branchId={branchId}
          rooms={data.rooms}
          unavailable={query.isError || query.isFetching || pending || Boolean(editor)}
          blocked={locked}
        />
      ) : null}
      {edit ? (
        <InventoryImport
          actorId={actorId}
          branchId={branchId}
          roomTypes={data.roomTypes}
          unavailable={query.isError || query.isFetching || pending || Boolean(editor)}
          blocked={locked}
        />
      ) : null}
      {data.canConfigureManagers || data.permissions.includes('booking_manage') ? (
        <PaymentInstructionsSettings
          actorId={actorId}
          branchId={branchId}
          owner={data.canConfigureManagers}
        />
      ) : null}
      {mutation.isError ? (
        <p role="alert">
          {errorMessage(mutation.error)} Review your access and current inventory before retrying.
        </p>
      ) : null}
      {editor && !editorAvailable ? (
        <div className="space-y-2">
          <p role="alert">This inventory is no longer available for this edit.</p>
          <Button variant="secondary" onClick={close}>
            Close unavailable edit
          </Button>
        </div>
      ) : null}
      {editorAvailable && editor?.mode === 'type' && prices ? (
        <RoomTypeEditor
          configurationOnly={Boolean(initial)}
          key={'type:' + (editor.id ?? 'new')}
          {...(initial ? { initial } : {})}
          pending={pending}
          unavailable={unavailable}
          onCancel={close}
          onSave={(input) => save({ kind: 'type', input, ...(editor.id ? { id: editor.id } : {}) })}
        />
      ) : null}
      {editorAvailable && editor?.mode === 'room' && edit ? (
        <PhysicalInventoryEditor
          key="new-room"
          roomTypes={data.roomTypes}
          bed={false}
          pending={pending}
          unavailable={unavailable}
          onCancel={close}
          onRoom={(input) => save({ kind: 'room', input })}
          onBed={() => undefined}
        />
      ) : null}
      {editorAvailable && editor?.mode === 'seat' && edit ? (
        <PhysicalInventoryEditor
          key={'bed:' + editor.roomId}
          roomTypes={data.roomTypes}
          bed
          pending={pending}
          unavailable={unavailable}
          onCancel={close}
          onRoom={() => undefined}
          onBed={(input) => save({ kind: 'seat', roomId: editor.roomId, input })}
        />
      ) : null}
      {editorAvailable &&
      editor?.mode === 'lifecycle' &&
      edit &&
      (editor.resource !== 'room_type' || prices) ? (
        <InventoryLifecycleEditor
          key={editor.id + ':' + editor.archive}
          label={editor.label}
          archive={editor.archive}
          pending={pending}
          unavailable={unavailable}
          onCancel={close}
          onSave={(reason, status) => {
            if (editor.archive)
              save({
                kind: 'archive',
                resource: editor.resource,
                id: editor.id,
                reason,
              });
            else if (status && editor.resource !== 'room_type')
              save({
                kind: 'state',
                resource: editor.resource,
                id: editor.id,
                reason,
                status,
              });
          }}
        />
      ) : null}
      <p>Select a room type to view its rooms, then a room to view its beds.</p>
      {!data.roomTypes.length ? (
        <p>
          {paging.typeCursor
            ? 'No room types on this page.'
            : 'No room types have been created for this branch.'}
        </p>
      ) : null}
      {data.roomTypes.map((type) => (
        <article key={type.id} className="space-y-3 rounded-panel border border-hsm-border p-4">
          <h3 className="font-semibold">
            {type.name}
            {type.archivedAt ? ' — Archived' : ''}
          </h3>
          <p>
            Capacity {type.capacity} · {type.inventoryMode.replaceAll('_', ' ')}
          </p>
          <p>
            {type.bedMonthlyRentPaisa !== null
              ? 'Bed: ' + marketplacePrice(type.bedMonthlyRentPaisa) + '/month. '
              : ''}
            {type.roomMonthlyRentPaisa !== null
              ? 'Room: ' + marketplacePrice(type.roomMonthlyRentPaisa) + '/month. '
              : ''}
            Deposit: {marketplacePrice(type.depositPaisa)}.
          </p>
          {!type.archivedAt ? (
            <RoomTypeAmenities
              actorId={actorId}
              branchId={branchId}
              roomTypeId={type.id}
              roomLabel={type.name}
            />
          ) : null}
          {!type.archivedAt ? (
            <InventoryPricing
              actorId={actorId}
              branchId={branchId}
              type={type}
              canEdit={prices}
              unavailable={query.isError || query.isFetching}
              blocked={locked || navigationDisabled}
            />
          ) : null}
          {!type.archivedAt ? (
            <BookingPolicySettings
              actorId={actorId}
              target={{ level: 'room_type', id: type.id, branchId }}
            />
          ) : null}
          {!type.archivedAt ? (
            <BillingPolicySettings
              actorId={actorId}
              target={{ branchId, roomTypeId: type.id }}
              roomTypeName={type.name}
              accessUnavailable={query.isError || query.isFetching}
            />
          ) : null}
          {type.fees.map((fee) => (
            <p key={fee.code + ':' + fee.cadence}>
              {fee.code}: {marketplacePrice(fee.amountPaisa)} ({fee.cadence.replaceAll('_', ' ')})
            </p>
          ))}
          {!type.archivedAt && prices ? (
            <div className="flex gap-3">
              <Button
                variant="secondary"
                disabled={pending || unavailable}
                onClick={() => open({ mode: 'type', id: type.id })}
              >
                Edit {type.name}
              </Button>
              <Button
                variant="ghost"
                disabled={pending || unavailable}
                onClick={() => lifecycle('room_type', type.id, type.name, true)}
              >
                Archive {type.name}
              </Button>
            </div>
          ) : null}
          {!type.archivedAt && paging.selectedTypeId !== type.id ? (
            <Button
              variant="secondary"
              disabled={navigationDisabled}
              onClick={() => paging.selectType(type.id)}
            >
              View rooms for {type.name}
            </Button>
          ) : null}
          {paging.selectedTypeId === type.id ? (
            <InventoryRoomList
              actorId={actorId}
              branchId={branchId}
              rooms={data.rooms.filter((room) => room.roomTypeId === type.id)}
              edit={edit}
              pending={pending || unavailable}
              navigationDisabled={navigationDisabled}
              paging={paging}
              onBed={(roomId) => open({ mode: 'seat', roomId })}
              onLifecycle={lifecycle}
            />
          ) : null}
        </article>
      ))}
      <InventoryPageControls
        label="room type"
        current={Boolean(paging.typeCursor)}
        next={Boolean(paging.nextTypeCursor)}
        disabled={navigationDisabled}
        onFirst={paging.firstTypes}
        onNext={paging.nextTypes}
      />
    </section>
  );
}
