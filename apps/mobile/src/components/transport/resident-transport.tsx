import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  marketplacePrice,
  readStayRoutes,
  readStayTransport,
  requestTransport,
  residentTransportAction,
} from '@hsm/api-client';
import type { TransportSubscription } from '@hsm/contracts';
import { mobileColors as c, mobileOwnerColors } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { useNativeCommand } from '../services/use-command';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Skeleton } from '../loading/skeleton';
import { SetupButton } from '../owner-wizard-ui';
import { formatDate } from '../date-field';
import { RouteSummary, TransportCard } from './transport-ui';
const statusText: Record<TransportSubscription['status'], string> = {
  requested: 'Waiting for the hostel',
  active: 'Subscribed',
  ended: 'Ended',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
};
// SERV-002 / CHG-042: the resident sees each route with its price. Included routes need nothing;
// a paid route is joined only after the resident confirms the exact monthly price shown.
export function ResidentTransport(props: { actorId: string; stayId: string; closed: boolean }) {
  const { actorId, stayId, closed } = props;
  const routes = useQuery({
    queryKey: ['stay-routes', actorId, stayId],
    enabled: !closed,
    gcTime: 0,
    retry: false,
    queryFn: async () => readStayRoutes(await actorClient(actorId), stayId),
  });
  const mine = useInfiniteQuery({
    queryKey: ['stay-transport', actorId, stayId],
    gcTime: 0,
    retry: false,
    initialPageParam: '',
    queryFn: async ({ pageParam }) =>
      readStayTransport(await actorClient(actorId), stayId, {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const refresh = [['stay-transport', actorId, stayId]];
  const ask = useNativeCommand(
    'resident-transport-ask:' + stayId,
    actorId,
    (client, body: { monthlyChargePaisa: number; routeId?: string }, key) =>
      requestTransport(client, stayId, body, key),
    refresh,
  );
  const act = useNativeCommand(
    'resident-transport-act:' + stayId,
    actorId,
    (client, body: { id: string; act: 'withdraw' | 'end'; version: number }, key) =>
      residentTransportAction(
        client,
        stayId,
        body.id,
        body.act,
        { expectedVersion: body.version },
        key,
      ),
    refresh,
  );
  const subs = mine.data?.pages.flatMap((page) => page.data) ?? [];
  const current = subs.find((row) => row.status === 'requested' || row.status === 'active');
  const offer = routes.data?.offer;
  // CHG-042: one branch fee covers every paid route; the resident says which one they ride.
  const paid = (routes.data?.data ?? []).filter((route) => route.pricingMode === 'separate');
  const [choice, setChoice] = useState<string>();
  const chosen = paid.find((route) => route.id === choice) ?? paid[0];
  const error = ask.error ?? act.error ?? routes.error ?? mine.error;
  if (mine.isPending || (!closed && routes.isPending))
    return <Skeleton kind="list" label="Loading transport" />;
  return (
    <View style={{ gap: 10 }} accessibilityLabel="Transport">
      <NativeCommandRecovery command={ask} />
      <NativeCommandRecovery command={act} />
      {error ? <Text style={{ color: c.dangerText }}>{safeMessage(error)}</Text> : null}
      {!closed && routes.isSuccess && !routes.data.data.length ? (
        <Text style={{ color: c.secondary }}>No routes available.</Text>
      ) : null}
      {!closed && (offer || current) ? (
        <TransportCard>
          {!current && offer?.mode === 'separate' && paid.length > 1 ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: c.heading, fontWeight: '700' }}>Your route</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {paid.map((route) => {
                  const on = route.id === chosen?.id;
                  return (
                    <Pressable
                      key={route.id}
                      accessibilityRole="button"
                      accessibilityLabel={'Ride ' + route.name}
                      accessibilityState={{ selected: on }}
                      onPress={() => setChoice(route.id)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: on ? c.primary : c.border,
                        backgroundColor: on ? c.primary : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          color: on ? mobileOwnerColors.onPrimary : c.text,
                          fontWeight: '600',
                        }}
                      >
                        {route.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <SubscriptionAction
            included={offer?.mode === 'included'}
            price={offer?.mode === 'separate' ? offer.monthlyChargePaisa : undefined}
            current={current}
            busy={ask.isPending || act.isPending || !mine.isSuccess}
            subscribe={(monthlyChargePaisa) =>
              ask.mutate({ monthlyChargePaisa, ...(chosen ? { routeId: chosen.id } : {}) })
            }
            act={(row, kind) => act.mutate({ id: row.id, act: kind, version: row.version })}
          />
        </TransportCard>
      ) : null}
      {(routes.data?.data ?? []).map((route) => (
        <TransportCard key={route.id}>
          <RouteSummary route={route} hidePrice />
        </TransportCard>
      ))}
      {subs
        .filter((row) => !['requested', 'active'].includes(row.status))
        .map((row) => (
          <Text key={row.id} style={{ color: c.secondary, fontSize: 13 }}>
            {row.routeName}: {statusText[row.status]}
            {row.effectiveTo ? ' on ' + formatDate(row.effectiveTo) : ''}
          </Text>
        ))}
      {mine.hasNextPage ? (
        <SetupButton
          secondary
          label="More history"
          disabled={mine.isFetchingNextPage}
          onPress={() => void mine.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}
function SubscriptionAction(props: {
  included: boolean;
  price: number | undefined;
  current: TransportSubscription | undefined;
  busy: boolean;
  subscribe: (price: number) => void;
  act: (row: TransportSubscription, kind: 'withdraw' | 'end') => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { current, price } = props;
  if (props.included)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CheckCircle2 color={c.primary} size={18} />
        <Text style={{ color: c.primary, fontWeight: '700' }}>Included in your rent</Text>
      </View>
    );
  if (current)
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.primary, fontWeight: '700' }}>
          {statusText[current.status]}
          {current.effectiveFrom ? ' · from ' + formatDate(current.effectiveFrom) : ''}
          {' · ' + marketplacePrice(current.monthlyChargePaisa) + '/month'}
        </Text>
        {current.status === 'requested' ? (
          <SetupButton
            secondary
            label="Withdraw transport request"
            disabled={props.busy}
            onPress={() => props.act(current, 'withdraw')}
          />
        ) : current.endRequestedAt ? (
          <Text style={{ color: c.secondary, fontSize: 13 }}>
            You asked to stop. The hostel will set the last day.
          </Text>
        ) : (
          <SetupButton
            secondary
            label="Stop transport"
            disabled={props.busy}
            onPress={() => props.act(current, 'end')}
          />
        )}
      </View>
    );
  if (price === undefined) return null;
  return confirming ? (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.heading }}>
        {marketplacePrice(price)} per month, billed separately from rent from the day the hostel
        approves.
      </Text>
      <SetupButton
        label="Confirm"
        disabled={props.busy}
        onPress={() => {
          props.subscribe(price);
          setConfirming(false);
        }}
      />
      <SetupButton secondary label="Cancel" onPress={() => setConfirming(false)} />
    </View>
  ) : (
    <SetupButton
      label={'Subscribe — ' + marketplacePrice(price) + '/month'}
      disabled={props.busy}
      onPress={() => setConfirming(true)}
    />
  );
}
