'use client';
import { AdmissionInventoryHost } from './admission-inventory-host';
import { useState } from 'react';
import { ManagerGrants } from './manager-grants';
import { ListingGallery } from './listing-gallery';
import { ListingSettings } from './listing-settings';
import { useBranchInventory, inventoryScopeDenied } from './use-branch-inventory';
import { InventoryNavigationProvider, useInventoryNavigationLocked } from './inventory-navigation';
import { InventoryBody } from './inventory-body';
import type { InventoryEditor } from './inventory-editor-state';
import { PropertyManagement } from './property-management';
type Props = { actorId: string; branchId: string; branchLabel?: string };
export function BranchInventory(props: Props) {
  return (
    <InventoryNavigationProvider key={props.actorId + ':' + props.branchId}>
      <Inventory {...props} />
    </InventoryNavigationProvider>
  );
}
function Inventory({ actorId, branchId, branchLabel }: Props) {
  const [editor, setEditor] = useState<InventoryEditor>();
  const state = useBranchInventory(actorId, branchId, () => setEditor(undefined));
  const locked = useInventoryNavigationLocked();
  const { query, mutation } = state;
  const denied = inventoryScopeDenied(query.error) || inventoryScopeDenied(mutation.error);
  function open(value: InventoryEditor) {
    if (!mutation.isPending && !query.isError && !query.isFetching && !locked) {
      mutation.reset();
      setEditor(value);
    }
  }
  function close() {
    if (!mutation.isPending) {
      mutation.reset();
      setEditor(undefined);
    }
  }
  return (
    <section className="space-y-4" aria-label="Branch listing and inventory">
      {!denied ? (
        <>
          <ListingSettings actorId={actorId} branchId={branchId} />
          <ListingGallery actorId={actorId} branchId={branchId} />
          <PropertyManagement
            actorId={actorId}
            branchId={branchId}
            disabled={Boolean(editor) || mutation.isPending || locked}
          />
          {state.access?.canConfigureManagers ? (
            <ManagerGrants actorId={actorId} branchId={branchId} />
          ) : null}
        </>
      ) : null}
      {locked ? (
        <p role="status">Close the open settings panel before changing inventory pages.</p>
      ) : null}
      {branchLabel ? (
        <AdmissionInventoryHost
          actorId={actorId}
          branchId={branchId}
          branchLabel={branchLabel}
          state={state}
          blocked={Boolean(editor) || mutation.isPending}
        />
      ) : null}
      <InventoryBody
        actorId={actorId}
        branchId={branchId}
        state={state}
        editor={editor}
        open={open}
        close={close}
      />
    </section>
  );
}
