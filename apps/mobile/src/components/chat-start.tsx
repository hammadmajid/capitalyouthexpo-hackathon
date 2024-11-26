import { useState } from 'react';
import { View } from 'react-native';
import { conversationSchema } from '@hsm/contracts';
import { safeMessage } from '../lib/messages';
import { useChatCommand } from './use-chat-command';
import { Chat } from './chat';
import { Button, Copy } from './ui';
export function ChatStart({
  branchId,
  actorId,
  signIn,
}: {
  branchId: string;
  actorId?: string;
  signIn(): void;
}) {
  if (!actorId) return <Button secondary label="Sign in to message this hostel" onPress={signIn} />;
  return <Start key={actorId + ':' + branchId} actorId={actorId} branchId={branchId} />;
}
function Start({ actorId, branchId }: { actorId: string; branchId: string }) {
  const { mutation, locked } = useChatCommand(actorId),
    [conversationId, setConversationId] = useState<string>();
  const options = {
    onSuccess: (value: unknown) => setConversationId(conversationSchema.parse(value).id),
  };
  if (conversationId) return <Chat actorId={actorId} initialConversationId={conversationId} />;
  return (
    <View className="gap-3">
      <Button
        disabled={locked}
        label="Message this hostel"
        onPress={() => mutation.mutate({ kind: 'create', body: { branchId } }, options)}
      />
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {locked && !mutation.isPending ? (
        <Button
          label="Retry original conversation request"
          onPress={() => mutation.mutate(undefined, options)}
        />
      ) : null}
    </View>
  );
}
