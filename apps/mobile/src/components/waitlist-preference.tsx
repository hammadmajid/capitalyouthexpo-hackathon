import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { listPublicInventoryRoomTypes } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
export function WaitlistPreference({
  actorId,
  branchId,
  disabled,
  choose,
  openTypes,
}: {
  actorId: string;
  branchId: string;
  disabled: boolean;
  // CHG-040: only room types where a resident has given notice can be waited for.
  openTypes?: readonly string[];
  choose: (value: { id: string; name: string } | null) => void;
}) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ['waitlist-room-types', branchId, cursor],
    retry: false,
    enabled: open,
    queryFn: async () =>
      listPublicInventoryRoomTypes(await actorClient(actorId), branchId, cursor ? { cursor } : {}),
  });
  return (
    <View className="gap-2">
      <Button
        secondary
        disabled={disabled}
        label={open ? 'Hide waiting-list preferences' : 'Choose waiting-list room type'}
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <>
          <Button
            secondary
            disabled={disabled}
            label="Any room type"
            onPress={() => choose(null)}
          />
          {query.isError ? (
            <>
              <Copy alert>{safeMessage(query.error)}</Copy>
            </>
          ) : query.isPending || query.isFetching ? (
            <Skeleton kind="inline" label="Loading waiting-list room types…" />
          ) : (
            <>
              {query.data?.data
                .filter((row) => !openTypes || openTypes.includes(row.id))
                .map((row) => (
                  <Button
                    key={row.id}
                    secondary
                    disabled={disabled}
                    label={row.name + ': join preference'}
                    onPress={() => choose({ id: row.id, name: row.name })}
                  />
                ))}
              {!query.data?.data.length ? <Copy>No published room types on this page.</Copy> : null}
              <Button
                secondary
                disabled={disabled || !cursor}
                label="First waiting-list room-type page"
                onPress={() => setCursor(undefined)}
              />
              <Button
                secondary
                disabled={disabled || !query.data?.nextCursor}
                label="Next waiting-list room-type page"
                onPress={() => setCursor(query.data?.nextCursor ?? undefined)}
              />
            </>
          )}
        </>
      ) : null}
    </View>
  );
}
