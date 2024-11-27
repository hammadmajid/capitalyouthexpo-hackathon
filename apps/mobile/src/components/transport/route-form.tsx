import { useState } from 'react';
import { AppHeader } from '../navigation/header';
import { Text, TextInput, View } from 'react-native';
import { createTransportRoute, updateTransportRoute } from '@hsm/api-client';
import {
  transportRouteInputSchema,
  type TransportDestination,
  type TransportRoute,
} from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { useNativeCommand } from '../services/use-command';
import { FieldLabel, SetupButton, SetupCard } from '../owner-wizard-ui';
import { DestinationPicker } from './destination-picker';
const field =
  'min-h-12 rounded-input border border-border bg-inputSurface px-4 font-body text-text';
export const transportKeys = (actorId: string, branchId: string) => [
  ['transport-routes', actorId, branchId],
  ['transport-overview', actorId, branchId],
];
// CHG-049: a route is just a name and the places transport is available at. Timings, pick-up
// points and the description are no longer asked; saving clears any old ones so nothing hidden
// stays on the route. The server checks catalog places and keeps the previous version in its log.
export function RouteForm(props: {
  actorId: string;
  branchId: string;
  route?: TransportRoute;
  embedded?: boolean;
  close: () => void;
}) {
  const route = props.route;
  const [name, setName] = useState(route?.name ?? '');
  const [destinations, setDestinations] = useState<TransportDestination[]>(
    route?.destinations ?? [],
  );
  const [problem, setProblem] = useState<string>();
  const save = useNativeCommand<
    ReturnType<typeof transportRouteInputSchema.parse> & { status: 'active' | 'inactive' }
  >(
    'transport-route:' + (route?.id ?? 'new'),
    props.actorId,
    (client, body, key) =>
      route
        ? updateTransportRoute(
            client,
            props.branchId,
            route.id,
            { ...body, expectedVersion: route.version },
            key,
          )
        : createTransportRoute(client, props.branchId, body, key),
    transportKeys(props.actorId, props.branchId),
  );
  const busy = save.isPending || save.unresolved;
  function submit(status: 'active' | 'inactive') {
    // An unnamed route is named after its first place.
    const label = name.trim() || destinations[0]?.name || '';
    if (label.length < 2) return setProblem('Add a place first.');
    if (status === 'active' && !destinations.length) return setProblem('Add a place first.');
    const parsed = transportRouteInputSchema.safeParse({
      name: label.slice(0, 120),
      status,
      destinations,
      stopPoints: [],
      departureTimes: [],
      trips: [],
    });
    if (!parsed.success)
      return setProblem(parsed.error.issues[0]?.message ?? 'Check route details.');
    setProblem(undefined);
    save.mutate({ ...parsed.data, status }, { onSuccess: props.close });
  }
  const content = (
    <View className="gap-3">
      <AppHeader
        title={route ? 'Edit route' : 'New route'}
        backLabel="Close route without saving"
        backDisabled={save.isPending}
        onBack={props.close}
      />
      <FieldLabel>Available at</FieldLabel>
      <DestinationPicker value={destinations} onChange={setDestinations} disabled={busy} />
      <FieldLabel>Route name (optional)</FieldLabel>
      <TextInput
        accessibilityLabel="Route name"
        placeholder={destinations[0]?.name ?? 'e.g. University route'}
        placeholderTextColor={c.secondary}
        value={name}
        onChangeText={setName}
        maxLength={120}
        editable={!busy}
        className={field}
      />
      {problem ? <Text style={{ color: c.dangerText }}>{problem}</Text> : null}
      {save.isError ? <Text style={{ color: c.dangerText }}>{safeMessage(save.error)}</Text> : null}
      {save.unresolved && !save.isPending ? (
        <SetupButton label="Retry the same save" onPress={() => save.retryOriginal()} />
      ) : (
        <SetupButton
          label={save.isPending ? 'Saving…' : route ? 'Save route' : 'Publish route'}
          disabled={busy}
          onPress={() => submit(route?.status ?? 'active')}
        />
      )}
      {route ? (
        <SetupButton
          secondary
          // Private routes stay saved but are not offered to residents.
          label={route.status === 'active' ? 'Make private' : 'Publish route'}
          disabled={busy}
          onPress={() => submit(route.status === 'active' ? 'inactive' : 'active')}
        />
      ) : null}
    </View>
  );
  return props.embedded ? content : <SetupCard>{content}</SetupCard>;
}
