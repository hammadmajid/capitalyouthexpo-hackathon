import { OwnerCustomAmenities } from './owner-custom-amenities';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  listApprovedAmenities,
  readRoomLevelAmenities,
  saveRoomLevelAmenities,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { safeMessage } from '../lib/messages';
import { useNativeCommand } from './services/use-command';
import { ChoiceTile, SetupButton, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';
// Only in-room amenities are offered per room; hostel-wide ones (Wi-Fi, mess, parking…) stay
// on the hostel. Previously saved codes outside this list are kept on save.
const ROOM_CODES = ['air_conditioning', 'attached_bath'];
// ROOM-AMN (SRS v2.15): each room keeps its own amenities (versioned, audited server-side).
export function OwnerRoomAmenities({
  actorId,
  branchId,
  roomId,
}: {
  actorId: string;
  branchId: string;
  roomId: string;
}) {
  const key = ['owner-room-amenities', actorId, branchId, roomId];
  const state = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () =>
      withFreshSession(async () =>
        readRoomLevelAmenities(await actorClient(actorId), branchId, roomId),
      ),
  });
  const catalog = useQuery({
    queryKey: ['owner-amenity-catalog', actorId],
    retry: false,
    queryFn: () =>
      withFreshSession(
        async () => (await listApprovedAmenities(await actorClient(actorId), { limit: 100 })).data,
      ),
  });
  const [selection, setSelection] = useState<string[]>();
  const saved = state.data?.amenities.map((row) => row.code) ?? [];
  const chosen = selection ?? saved;
  const command = useNativeCommand<{ version: string; codes: string[] }>(
    'owner-room-amenities:' + roomId,
    actorId,
    (client, body, commandKey) =>
      saveRoomLevelAmenities(
        client,
        branchId,
        roomId,
        body.version,
        { mode: 'custom', amenityCodes: body.codes },
        commandKey,
      ),
    [key],
  );
  const busy = command.isPending || command.unresolved || !state.data?.canEdit;
  const failure = state.error ?? catalog.error ?? command.error;
  return (
    <SetupCard>
      <SetupHeading>Room amenities</SetupHeading>
      <OwnerCustomAmenities
        actorId={actorId}
        branchId={branchId}
        selected={chosen}
        change={busy ? undefined : setSelection}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(catalog.data ?? [])
          .filter((amenity) => ROOM_CODES.includes(amenity.code))
          .map((amenity) => (
            <ChoiceTile
              key={amenity.code}
              label={amenity.name}
              selected={chosen.includes(amenity.code)}
              disabled={busy}
              onPress={() =>
                setSelection(
                  chosen.includes(amenity.code)
                    ? chosen.filter((code) => code !== amenity.code)
                    : [...chosen, amenity.code],
                )
              }
            />
          ))}
      </View>
      {failure ? <SetupText alert>{safeMessage(failure)}</SetupText> : null}
      {command.unresolved && !command.isPending ? (
        <SetupButton label="Retry previous amenity save" onPress={() => command.retryOriginal()} />
      ) : null}
      <SetupButton
        label={command.isPending ? 'Saving…' : 'Save room amenities'}
        disabled={busy || selection === undefined}
        onPress={() =>
          state.data &&
          command.mutate(
            { version: state.data.version, codes: chosen },
            { onSuccess: () => setSelection(undefined) },
          )
        }
      />
    </SetupCard>
  );
}
