'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listApprovedAmenities,
  readRoomLevelAmenities,
  saveRoomLevelAmenities,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { useCommand } from '../services/use-command';
import { Button } from '../ui/button';
import { CustomAmenities } from './custom-amenities';
// Only in-room amenities are offered per room; hostel-wide ones (Wi-Fi, mess, parking…) stay on
// the hostel listing, as on mobile. Previously saved codes outside this list are kept on save.
export const roomAmenityCodes = ['air_conditioning', 'attached_bath'];
type Props = { actorId: string; branchId: string; roomId: string };
// ROOM-AMN (SRS v2.15): each room keeps its own amenities (versioned and audited server-side).
export function RoomAmenities({ actorId, branchId, roomId }: Props) {
  const key = ['room-amenities', actorId, branchId, roomId];
  const state = useQuery({
    queryKey: key,
    retry: false,
    queryFn: () => readRoomLevelAmenities(browserClient(), branchId, roomId),
  });
  const catalog = useQuery({
    queryKey: ['approved-amenities', actorId, 'room'],
    retry: false,
    queryFn: async () => (await listApprovedAmenities(browserClient(), { limit: 100 })).data,
  });
  const [selection, setSelection] = useState<string[]>();
  const chosen = selection ?? state.data?.amenities.map((row) => row.code) ?? [];
  const command = useCommand<{ version: string; codes: string[] }>(
    'room-amenities:' + roomId,
    (body, commandKey) =>
      saveRoomLevelAmenities(
        browserClient(),
        branchId,
        roomId,
        body.version,
        { mode: 'custom', amenityCodes: body.codes },
        commandKey,
      ),
    [key],
  );
  const locked = command.isPending || command.unresolved || !state.data?.canEdit;
  const failure = state.error ?? catalog.error ?? command.error;
  return (
    <section aria-label="Room amenities" className="space-y-2">
      <h5 className="font-semibold">Room amenities</h5>
      {state.isPending ? <p role="status">Loading room amenities…</p> : null}
      {(catalog.data ?? [])
        .filter((amenity) => roomAmenityCodes.includes(amenity.code))
        .map((amenity) => (
          <label key={amenity.code} className="flex gap-2">
            <input
              type="checkbox"
              checked={chosen.includes(amenity.code)}
              disabled={locked}
              onChange={() =>
                setSelection(
                  chosen.includes(amenity.code)
                    ? chosen.filter((code) => code !== amenity.code)
                    : [...chosen, amenity.code],
                )
              }
            />
            {amenity.name}
          </label>
        ))}
      <CustomAmenities
        actorId={actorId}
        branchId={branchId}
        selected={chosen}
        change={locked ? undefined : setSelection}
      />
      {failure ? <p role="alert">{errorMessage(failure)}</p> : null}
      {command.unresolved && !command.isPending ? (
        <Button onClick={() => command.retryOriginal()}>Retry previous amenity save</Button>
      ) : null}
      {state.data?.canEdit ? (
        <Button
          disabled={locked || selection === undefined}
          onClick={() =>
            state.data &&
            command.mutate(
              { version: state.data.version, codes: chosen },
              { onSuccess: () => setSelection(undefined) },
            )
          }
        >
          {command.isPending ? 'Saving…' : 'Save room amenities'}
        </Button>
      ) : null}
    </section>
  );
}
