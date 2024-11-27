import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Bus } from 'lucide-react-native';
import { createTransportRoute, updateTransportRoute } from '@hsm/api-client';
import {
  transportRouteInputSchema,
  type TransportDestination,
  type TransportRoute,
} from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { useNativeCommand } from '../services/use-command';
import { SetupHeading, SetupText } from '../owner-wizard-ui';
import { DestinationPicker } from './destination-picker';
import { transportKeys } from './route-form';
// Saved under one route record named "Transport"; owners and customers only see the places.
const holderName = 'Transport';
// CHG-049: Transport in Hostel Setup is an on/off switch and a list of places. Each add or
// remove saves straight away. The places live on the branch's first route (created on the
// first add); it is shown to customers while it has a place and hidden when the list is empty.
// Places on any other old route are folded into it on the next change, and that route is made
// private, so nothing stays hidden on a second route.
export function TransportPlaces(props: {
  actorId: string;
  branchId: string;
  routes: TransportRoute[];
  canEdit: boolean;
}) {
  const [holder, ...others] = props.routes;
  const shown = dedupe([holder, ...others].flatMap((route) => route?.destinations ?? []));
  const save = useNativeCommand<{ places: TransportDestination[]; on: boolean }>(
    'transport-places:' + props.branchId,
    props.actorId,
    async (client, body, key) => {
      const input = transportRouteInputSchema.parse({
        name: holder?.name ?? holderName,
        status: body.on && body.places.length ? 'active' : 'inactive',
        destinations: body.places,
        stopPoints: [],
        departureTimes: [],
        trips: [],
      });
      const status = body.on && body.places.length ? ('active' as const) : ('inactive' as const);
      const result = holder
        ? await updateTransportRoute(
            client,
            props.branchId,
            holder.id,
            { ...input, status, expectedVersion: holder.version },
            key,
          )
        : await createTransportRoute(client, props.branchId, { ...input, status }, key);
      for (const route of others.filter((row) => row.status === 'active'))
        await updateTransportRoute(
          client,
          props.branchId,
          route.id,
          {
            ...transportRouteInputSchema.parse({
              name: route.name,
              status: 'inactive',
              destinations: route.destinations,
              stopPoints: [],
              departureTimes: [],
              trips: [],
            }),
            status: 'inactive',
            expectedVersion: route.version,
          },
          key + ':' + route.id,
        );
      return result;
    },
    transportKeys(props.actorId, props.branchId),
  );
  const busy = save.isPending || save.unresolved;
  // On = customers see the places; Off keeps the places saved but hidden. Switching on with no
  // places yet just opens the list (it goes live with the first place).
  const [wantOn, setWantOn] = useState<boolean>();
  const on = wantOn ?? holder?.status === 'active';
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Bus color={c.primary} size={21} />
        <View className="flex-1">
          <SetupHeading>Transport</SetupHeading>
        </View>
        <Text style={{ color: on ? c.primary : c.secondary, fontWeight: '600' }}>
          {on ? 'On' : 'Off'}
        </Text>
        <Switch
          accessibilityLabel="Transport available"
          value={on}
          disabled={busy || !props.canEdit}
          trackColor={{ true: c.primary, false: c.border }}
          onValueChange={(next) => {
            setWantOn(next);
            if (holder && shown.length) save.mutate({ places: shown, on: next });
          }}
        />
      </View>
      {!on ? null : props.canEdit ? (
        <>
          {shown.length === 0 ? <SetupText muted>Add the places it goes to</SetupText> : null}
          <DestinationPicker
            value={shown}
            disabled={busy}
            onChange={(places) => save.mutate({ places, on: true })}
          />
        </>
      ) : (
        shown.map((place) => (
          <Text key={place.name} style={{ color: c.heading }}>
            {place.name}
          </Text>
        ))
      )}
      {save.isPending ? <SetupText muted>Saving…</SetupText> : null}
      {save.error ? <SetupText alert>{safeMessage(save.error)}</SetupText> : null}
    </View>
  );
}
function dedupe(places: TransportDestination[]) {
  const seen = new Set<string>();
  return places.filter((place) => {
    const key = place.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
