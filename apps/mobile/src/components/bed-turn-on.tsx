import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { Power } from 'lucide-react-native';
import { changeInventoryState } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { AppHeader } from './navigation/header';
import { PriceSection } from './price-form-parts';
import { Button, Copy } from './ui';
const reason = 'Opened to admit a resident';
// INV / ACC-001: only an active bed in an active room can take a resident. Turning them on is
// an audited inventory change done by the server under the caller's inventory grant.
export function BedTurnOn(props: {
  actorId: string;
  branchId: string;
  roomId: string;
  bedId: string;
  roomOn: boolean;
  onDone: () => void;
  onBack: () => void;
}) {
  const cache = useQueryClient();
  const [keys] = useState(() => ({ room: randomUUID(), seat: randomUUID() }));
  const turnOn = useMutation({
    mutationFn: async () => {
      const client = await actorClient(props.actorId);
      const input = { status: 'active' as const, reason };
      if (!props.roomOn)
        await changeInventoryState(client, props.branchId, 'room', props.roomId, input, keys.room);
      await changeInventoryState(client, props.branchId, 'seat', props.bedId, input, keys.seat);
    },
    onSuccess: async () => {
      const scopes = ['branch-inventory-pages', 'bed-detail', 'floor-rooms', 'bed-board'];
      await Promise.allSettled(
        scopes.map((scope) =>
          cache.invalidateQueries({ queryKey: [scope, props.actorId, props.branchId] }),
        ),
      );
      props.onDone();
    },
  });
  return (
    <View className="gap-3">
      <AppHeader
        title="Add resident"
        backLabel="Cancel admission"
        backDisabled={turnOn.isPending}
        onBack={props.onBack}
      />
      <PriceSection
        Icon={Power}
        title="This bed is off"
        note={props.roomOn ? 'Turn it on to add a resident' : 'Room and bed will be turned on'}
      >
        {turnOn.isError ? <Copy alert>{safeMessage(turnOn.error)}</Copy> : null}
        <Button
          label={turnOn.isPending ? 'Turning on…' : 'Turn bed on'}
          disabled={turnOn.isPending}
          onPress={() => turnOn.mutate()}
        />
      </PriceSection>
    </View>
  );
}
