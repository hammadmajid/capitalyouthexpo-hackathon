import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readInventoryAccess, readStaffStay } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { Copy } from './ui';
import { StaffPaymentHost } from './staff-payment-host';
import { StayDetails } from './stay-details';
import { useOwnerScreenBack } from './owner-screen-back';
// Same authorized detail/actions for current beds, former occupants and the directory.
export function StaffStayWorkspace(props: {
  actorId: string;
  branchId: string;
  stayId: string;
  onClose: () => void;
  onHistory?: (() => void) | undefined;
}) {
  useOwnerScreenBack(props.onClose);
  const access = useQuery({
    queryKey: ['inventory-access', props.actorId, props.branchId],
    retry: false,
    queryFn: async () => readInventoryAccess(await actorClient(props.actorId), props.branchId),
  });
  const allowed = !access.isError && (access.data?.permissions.includes('stay_manage') ?? false);
  const detail = useQuery({
    queryKey: ['private-stays', props.actorId, props.branchId, 'detail', props.stayId],
    retry: false,
    enabled: allowed,
    queryFn: async () =>
      readStaffStay(await actorClient(props.actorId), props.branchId, props.stayId),
  });
  const data = detail.data;
  if (allowed && data && !detail.isError)
    return (
      <StaffPaymentHost actorId={props.actorId} branchId={props.branchId} unavailable={false}>
        {(onRecord) => (
          <StayDetails
            actorId={props.actorId}
            branchId={props.branchId}
            data={data}
            permissions={access.data?.permissions ?? []}
            onNotice={() => undefined}
            onRecord={onRecord}
            onClose={props.onClose}
            onHistory={props.onHistory}
          />
        )}
      </StaffPaymentHost>
    );
  return (
    <View className="gap-2">
      <AppHeader title="Stay details" backLabel="Back from stay details" onBack={props.onClose} />
      {access.error || detail.error ? (
        <Copy alert>{safeMessage(access.error ?? detail.error)}</Copy>
      ) : !access.isPending && !allowed ? (
        <Copy alert>Stay management access required</Copy>
      ) : (
        <Skeleton kind="details" label="Loading stay details" />
      )}
    </View>
  );
}
