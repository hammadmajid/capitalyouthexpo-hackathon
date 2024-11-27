import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Users, UserPlus, Wallet, type LucideIcon } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { marketplacePrice, readInventoryAccess, readTransportOverview } from '@hsm/api-client';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { Skeleton } from '../loading/skeleton';
import { TransportSubscribers } from './transport-subscribers';
// Routes are configured in Hostel Setup; Operations manages subscribers and requests.
export function TransportWorkspace({
  actorId,
  branchId,
  initialStatus = 'active',
}: {
  actorId: string;
  branchId: string;
  initialStatus?: 'active' | 'requested';
}) {
  const [status, setStatus] = useState<'active' | 'requested'>(initialStatus);
  const access = useQuery({
    queryKey: ['transport-access', actorId, branchId],
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    queryFn: async () => readInventoryAccess(await actorClient(actorId), branchId),
  });
  const grants = access.isSuccess && !access.isFetching ? access.data.permissions : [];
  const canSeeBilling = grants.includes('finance_view');
  const canDecide = grants.includes('stay_manage') && grants.includes('rent_manage');
  const canRead = canSeeBilling || canDecide;
  const overview = useQuery({
    queryKey: ['transport-overview', actorId, branchId],
    gcTime: 0,
    retry: false,
    enabled: access.isSuccess,
    queryFn: async () => readTransportOverview(await actorClient(actorId), branchId),
  });
  if (access.isPending) return <Skeleton kind="list" label="Loading transport access…" />;
  if (access.error) return <Text style={{ color: c.dangerText }}>{safeMessage(access.error)}</Text>;
  const o = !overview.isError ? overview.data : undefined;
  return (
    <View style={{ gap: 12 }}>
      {overview.error ? (
        <Text style={{ color: c.dangerText }}>{safeMessage(overview.error)}</Text>
      ) : null}
      {o ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Stat
            Icon={Users}
            value={o.activeSubscribers}
            label="Transport subscribers"
            selected={status === 'active'}
            onPress={canRead ? () => setStatus('active') : undefined}
          />
          <Stat
            Icon={UserPlus}
            value={o.pendingRequests}
            label="Requests"
            selected={status === 'requested'}
            onPress={canRead ? () => setStatus('requested') : undefined}
          />
          {canSeeBilling && o.monthlyChargesPaisa !== null ? (
            <Stat
              Icon={Wallet}
              value={marketplacePrice(o.monthlyChargesPaisa)}
              label="Monthly transport fees"
            />
          ) : null}
        </View>
      ) : null}
      {canRead ? (
        <>
          <Text accessibilityRole="header" className="font-heading text-subtitle text-heading">
            {status === 'requested' ? 'Requests' : 'Transport subscribers'}
          </Text>
          <TransportSubscribers
            key={status}
            actorId={actorId}
            branchId={branchId}
            status={status}
            canDecide={canDecide}
            canSeeBilling={canSeeBilling}
            canRecord={canSeeBilling && grants.includes('payment_record')}
          />
        </>
      ) : (
        <Text style={{ color: c.secondary }}>
          Transport subscribers are unavailable for this account.
        </Text>
      )}
    </View>
  );
}
function Stat(props: {
  Icon: LucideIcon;
  value: number | string;
  label: string;
  selected?: boolean;
  onPress?: (() => void) | undefined;
}) {
  return (
    <Pressable
      accessibilityRole={props.onPress ? 'button' : 'text'}
      accessibilityLabel={props.label + ': ' + props.value}
      accessibilityState={props.onPress ? { selected: props.selected ?? false } : undefined}
      disabled={!props.onPress}
      onPress={props.onPress}
      style={[
        mobileSurfaces.icyCard,
        { flexBasis: '31%', flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 10, gap: 2 },
        props.onPress && props.selected && { borderColor: c.primary },
      ]}
    >
      <props.Icon color={c.primary} size={18} />
      <Text style={{ color: c.heading, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
        {props.value}
      </Text>
      <Text style={{ color: c.secondary, fontSize: 12 }}>{props.label}</Text>
    </Pressable>
  );
}
