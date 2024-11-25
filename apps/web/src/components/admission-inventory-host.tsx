'use client';
import { useState, type ComponentProps } from 'react';
import { useAdmissionAccess } from '../lib/use-admission-access';
import { errorMessage } from '../lib/messages';
import { AdmissionWorkflow } from './admission-workflow';
import { useAdmissionMetadata } from './use-admission-metadata';
import type { useBranchInventory } from './use-branch-inventory';
import { useInventoryNavigationLocked } from './inventory-navigation';
import { InventoryPageControls } from './inventory-page-controls';
import { Button } from './ui/button';
type State = Pick<ReturnType<typeof useBranchInventory>, 'query' | 'paging'>;
type Props = {
  actorId: string;
  branchId: string;
  branchLabel: string;
  state: State;
  blocked: boolean;
};
type Snapshot = Pick<
  ComponentProps<typeof AdmissionWorkflow>,
  'roomType' | 'rooms' | 'settings' | 'catalog'
>;
type Metadata = ReturnType<typeof useAdmissionMetadata>;
type View = {
  snapshot: Snapshot | undefined;
  metadata: Metadata;
  unavailable: boolean;
  ready: boolean;
  access: ReturnType<typeof useAdmissionAccess>['access'];
  close: () => void;
};
export function AdmissionInventoryHost(props: Props) {
  return <Host key={props.actorId + ':' + props.branchId} {...props} />;
}
function Host(props: Props) {
  const [open, setOpen] = useState(false),
    locked = useInventoryNavigationLocked(),
    { access, allowed, permitted } = useAdmissionAccess(
      props.actorId,
      props.branchId,
      props.state.query.isError || props.blocked,
    ),
    type = props.state.query.data?.roomTypes.find(
      (row) => row.id === props.state.paging.selectedTypeId && !row.archivedAt,
    ),
    metadata = useAdmissionMetadata(props.actorId, props.branchId, type?.id, open && allowed),
    current = admissionSource(props, metadata, allowed, type),
    snapshot = useAdmissionSnapshot(open, current);
  if (!open)
    return allowed ? (
      <Button variant="secondary" disabled={locked || props.blocked} onClick={() => setOpen(true)}>
        Admit resident
      </Button>
    ) : null;
  const view = {
    snapshot,
    metadata,
    access,
    ready: Boolean(current),
    close: () => setOpen(false),
    unavailable: admissionUnavailable(props, metadata, permitted) || access.isError,
  };
  return <AdmissionPanel {...props} view={view} />;
}
function currentInventory(query: State['query']) {
  if (query.isError || query.isFetching || query.isPending) return undefined;
  return query.data;
}
function admissionSource(
  props: Props,
  metadata: Metadata,
  allowed: boolean,
  type: Snapshot['roomType'] | undefined,
) {
  if (!allowed || props.blocked || !metadata.ready || !type) return undefined;
  const data = currentInventory(props.state.query),
    settings = metadata.settings.data;
  if (!data || !settings) return undefined;
  return { roomType: type, rooms: data.rooms, settings, catalog: metadata.entries };
}
function admissionUnavailable(props: Props, metadata: Metadata, permitted: boolean) {
  return !permitted || props.blocked || props.state.query.isError || Boolean(metadata.error);
}
// ACC-004: preserve a submitted command across metadata refresh, never across close/scope change.
function useAdmissionSnapshot(open: boolean, current: Snapshot | undefined) {
  const [snapshot, setSnapshot] = useState<{ signature: string; value: Snapshot }>();
  if (!open) {
    if (snapshot) setSnapshot(undefined);
    return undefined;
  }
  if (current) {
    const signature = JSON.stringify(current);
    if (signature !== snapshot?.signature) setSnapshot({ signature, value: current });
  }
  return snapshot?.value;
}
function AdmissionPanel(props: Props & { view: View }) {
  const { view } = props,
    pending = !view.ready || view.metadata.catalog.isFetchingNextPage;
  return (
    <section aria-label="Resident admission" className="space-y-4">
      <h2 className="text-xl font-semibold">Admit resident — {props.branchLabel}</h2>
      <AdmissionChoicesStatus {...props} />
      {view.snapshot ? (
        <AdmissionWorkflow
          {...view.snapshot}
          actorId={props.actorId}
          branchId={props.branchId}
          branchLabel={props.branchLabel}
          pending={pending}
          unavailable={view.unavailable}
          onRoom={props.state.paging.selectRoom}
          onCancel={view.close}
          onDone={view.close}
          navigation={
            <AdmissionNavigation {...props} metadata={view.metadata} disabled={pending} />
          }
        />
      ) : (
        <Button variant="ghost" onClick={view.close}>
          Cancel admission
        </Button>
      )}
    </section>
  );
}
function AdmissionChoicesStatus({ state, view }: Props & { view: View }) {
  const { metadata, access } = view,
    error = access.error ?? state.query.error ?? metadata.error;
  function refresh() {
    void access.refetch();
    void state.query.refetch();
    void metadata.settings.refetch();
    if (metadata.needsCatalog) void metadata.catalog.refetch();
  }
  return (
    <>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {!view.ready ? (
        <div className="space-y-2">
          <p role="status">
            Refresh current inventory, admission access and agreed billing policy before continuing.
          </p>
          <Button
            disabled={state.query.isFetching || metadata.settings.isFetching || access.isFetching}
            onClick={refresh}
          >
            Refresh admission choices
          </Button>
        </div>
      ) : null}
    </>
  );
}
function AdmissionNavigation({
  state,
  disabled,
  metadata,
}: Props & { disabled: boolean; metadata: Metadata }) {
  const paging = state.paging;
  return (
    <div className="space-y-3" aria-label="Admission inventory pages">
      <label className="field-label">
        Admission room type
        <select
          className="field-input"
          value={paging.selectedTypeId ?? ''}
          disabled={disabled}
          onChange={(event) => paging.selectType(event.target.value)}
        >
          {state.query.data?.roomTypes
            .filter((row) => !row.archivedAt)
            .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
        </select>
      </label>
      <AdmissionPagingControls paging={paging} disabled={disabled} />
      {metadata.needsCatalog && metadata.catalog.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => void metadata.catalog.fetchNextPage()}
        >
          Load more admission charges
        </Button>
      ) : null}
    </div>
  );
}
function AdmissionPagingControls({
  paging,
  disabled,
}: {
  paging: State['paging'];
  disabled: boolean;
}) {
  const groups = [
    {
      label: 'admission room types',
      current: Boolean(paging.typeCursor),
      next: Boolean(paging.nextTypeCursor),
      onFirst: paging.firstTypes,
      onNext: paging.nextTypes,
    },
    {
      label: 'admission rooms',
      current: Boolean(paging.roomCursor),
      next: Boolean(paging.nextRoomCursor),
      onFirst: paging.firstRooms,
      onNext: paging.nextRooms,
    },
    {
      label: 'admission beds',
      current: Boolean(paging.bedCursor),
      next: Boolean(paging.nextBedCursor),
      onFirst: paging.firstBeds,
      onNext: paging.nextBeds,
    },
  ];
  return (
    <>
      {groups.map((group) => (
        <InventoryPageControls key={group.label} {...group} disabled={disabled} />
      ))}
    </>
  );
}
