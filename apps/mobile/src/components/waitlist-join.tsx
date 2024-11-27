import { View } from 'react-native';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readPublicWaitlistOpen } from '@hsm/api-client';
import { client } from '../lib/runtime';
import { WaitlistPreference } from './waitlist-preference';
import { safeMessage } from '../lib/messages';
import { useWaitlistCommand } from './use-waitlist-command';
import { Button, Copy } from './ui';
export function WaitlistJoin(props: {
  branchId: string;
  actorId?: string;
  signIn: () => void;
  roomTypeId?: string;
}) {
  // CHG-040: a waiting list exists only once a resident has given notice; otherwise the
  // option is not offered at all (the server refuses such a join).
  const open = useQuery({
    queryKey: ['waitlist-open', props.branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => readPublicWaitlistOpen(client, props.branchId),
  });
  const types = open.data?.roomTypeIds;
  if (!open.data?.open || (props.roomTypeId && !types?.includes(props.roomTypeId))) return null;
  return props.actorId ? (
    <Join
      key={props.actorId + ':' + props.branchId + ':' + (props.roomTypeId ?? 'any')}
      {...props}
      actorId={props.actorId}
      openTypes={types ?? []}
    />
  ) : (
    <Button secondary label="Sign in to join the waiting list" onPress={props.signIn} />
  );
}
function Join({
  actorId,
  branchId,
  roomTypeId,
  openTypes,
}: {
  actorId: string;
  branchId: string;
  roomTypeId?: string;
  openTypes: readonly string[];
}) {
  const { mutation, locked } = useWaitlistCommand(actorId);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const preferenceId = roomTypeId ?? selected?.id;
  return (
    <View className="gap-3">
      <Copy>
        Waiting-list alerts do not reserve a bed or guarantee availability. No payment is taken.
      </Copy>
      {!roomTypeId ? (
        <>
          <Copy>Waiting-list preference: {selected?.name ?? 'Any room type'}</Copy>
          <WaitlistPreference
            actorId={actorId}
            branchId={branchId}
            disabled={locked}
            openTypes={openTypes}
            choose={(value) => {
              setSelected(value);
              mutation.reset();
            }}
          />
        </>
      ) : null}
      {mutation.isSuccess ? (
        <Copy>You are on this waiting list. Manage it in your Customer space.</Copy>
      ) : (
        <Button
          disabled={locked}
          label={mutation.isPending ? 'Joining waiting list…' : 'Join waiting list'}
          onPress={() =>
            mutation.mutate({
              kind: 'join',
              body: { branchId, ...(preferenceId ? { roomTypeId: preferenceId } : {}) },
            })
          }
        />
      )}
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {locked && !mutation.isPending ? (
        <>
          <Copy>Confirmation is uncertain. Retry the original request.</Copy>
          <Button label="Retry waiting-list request" onPress={() => mutation.mutate(undefined)} />
        </>
      ) : null}
    </View>
  );
}
