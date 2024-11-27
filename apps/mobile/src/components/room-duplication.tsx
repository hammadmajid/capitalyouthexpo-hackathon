import { useToolOpen } from './inventory-tools';
import { AppHeader } from './navigation/header';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { duplicateInventoryRoom, RetainedRoomDuplication } from '@hsm/api-client';
import { roomDuplicationInputSchema } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { useNativeInventoryNavigationLock } from './native-inventory-navigation';
type Props = {
  actorId: string;
  branchId: string;
  rooms: { id: string; label: string; archivedAt: string | null }[];
  unavailable: boolean;
  blocked: boolean;
};
export function NativeRoomDuplication(props: Props) {
  return <Panel key={props.actorId + ':' + props.branchId} {...props} />;
}
function Panel({ actorId, branchId, rooms, unavailable, blocked }: Props) {
  const [open, setOpen] = useToolOpen(),
    [roomId, setRoom] = useState(''),
    [labels, setLabels] = useState(''),
    [saved, setSaved] = useState(false);
  const cache = useQueryClient(),
    retained = useRef<RetainedRoomDuplication | null>(null);
  retained.current ??= new RetainedRoomDuplication(async (command, key) =>
    duplicateInventoryRoom(await actorClient(actorId), branchId, command.roomId, command.body, key),
  );
  const intent = retained.current;
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (retry: boolean) =>
      retry
        ? intent.retry()
        : intent.send(
            { roomId, body: { roomNumbers: labels.split(/[,\n]/) } },
            Crypto.randomUUID(),
          ),
    onSuccess: async () => {
      intent.reset();
      setLabels('');
      setSaved(true);
      await cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] });
    },
  });
  const locked = mutation.isPending || intent.locked;
  useNativeInventoryNavigationLock(open || locked);
  const valid =
    roomDuplicationInputSchema.safeParse({ roomNumbers: labels.split(/[,\n]/) }).success &&
    rooms.some((room) => room.id === roomId && !room.archivedAt);
  if (!open)
    return (
      <Button
        secondary
        label="Duplicate rooms"
        disabled={blocked || unavailable || !rooms.length}
        onPress={() => {
          setOpen(true);
          setSaved(false);
        }}
      />
    );
  return (
    <View className="gap-3">
      <AppHeader
        title="Duplicate rooms"
        backLabel="Close duplication"
        onBack={() => {
          intent.reset();
          mutation.reset();
          setOpen(false);
        }}
        backDisabled={locked}
      />
      <Copy>Copies capacity, price and amenities · new rooms start inactive</Copy>
      {saved ? (
        <Copy>Rooms duplicated. Pull down or page through inventory to review the new rooms.</Copy>
      ) : null}
      <Copy>Choose a source room</Copy>
      {rooms
        .filter((room) => !room.archivedAt)
        .map((room) => (
          <Button
            key={room.id}
            secondary={roomId !== room.id}
            label={'Use room ' + room.label}
            disabled={locked || unavailable}
            onPress={() => setRoom(room.id)}
          />
        ))}
      <Copy>
        Up to 100 new room numbers, comma or new line · an existing number stops the batch
      </Copy>
      <TextInput
        accessibilityLabel="New room numbers"
        value={labels}
        maxLength={8000}
        multiline
        editable={!locked && !unavailable}
        onChangeText={setLabels}
        className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
      />
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {intent.locked && !mutation.isPending ? (
        <Button
          label="Retry original duplication"
          disabled={unavailable}
          onPress={() => mutation.mutate(true)}
        />
      ) : (
        <Button
          label={mutation.isPending ? 'Duplicating…' : 'Create duplicate rooms'}
          disabled={locked || unavailable || !valid}
          onPress={() => {
            setSaved(false);
            mutation.mutate(false);
          }}
        />
      )}
    </View>
  );
}
