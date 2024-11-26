import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readBranchInventory, readInventoryAccess } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { NativeManualAdmission, canAdmitResidents } from './manual-admission';
import { Skeleton } from './loading/skeleton';
import { Button, Copy } from './ui';
// Owner/manager grants needed to admit a resident (BED-002 / RES-001).
export function useAdmissionAllowed(actorId: string, branchId: string) {
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    retry: false,
    queryFn: async () => readInventoryAccess(await actorClient(actorId), branchId),
  });
  return (
    !access.isError &&
    ['stay_manage', 'rent_manage', 'finance_view'].every((grant) =>
      access.data?.permissions.includes(grant as never),
    )
  );
}
export function BedAdmission(props: {
  actorId: string;
  branchId: string;
  bedId: string;
  // ACC-001: only an available bed can be assigned; the server enforces it too.
  blockedReason?: string | undefined;
  initialOpen?: boolean;
  onClose?: () => void;
  hideHeader?: boolean;
}) {
  const [open, setOpenState] = useState(props.initialOpen ?? false);
  const setOpen = (value: boolean) => {
    setOpenState(value);
    if (!value) props.onClose?.();
  };
  const allowed = useAdmissionAllowed(props.actorId, props.branchId);
  const inventory = useQuery({
    queryKey: ['branch-inventory-pages', props.actorId, props.branchId, 'summary'],
    enabled: open && allowed,
    retry: false,
    queryFn: async () => readBranchInventory(await actorClient(props.actorId), props.branchId),
  });
  if (!allowed) return null;
  if (!open)
    return (
      <View className="gap-1">
        <Button
          label="Add resident"
          disabled={Boolean(props.blockedReason)}
          onPress={() => setOpen(true)}
        />
        {props.blockedReason ? <Copy>{props.blockedReason}</Copy> : null}
      </View>
    );
  return (
    <View className="gap-2">
      {inventory.isPending ? <Skeleton kind="details" label="Loading admission" /> : null}
      {inventory.error ? <Copy alert>{safeMessage(inventory.error)}</Copy> : null}
      {inventory.data && !inventory.error && canAdmitResidents(inventory.data) ? (
        <NativeManualAdmission
          actorId={props.actorId}
          branchId={props.branchId}
          inventory={inventory.data}
          initialBedId={props.bedId}
          disabled={false}
          hideHeader={props.hideHeader ?? false}
        />
      ) : null}
      {props.initialOpen ? null : (
        <Button secondary label="Close admission" onPress={() => setOpen(false)} />
      )}
    </View>
  );
}
