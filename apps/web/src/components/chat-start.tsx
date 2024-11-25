'use client';
import Link from 'next/link';
import { useState } from 'react';
import { conversationSchema } from '@hsm/contracts';
import { authenticationPath, customerProfilePath } from '../lib/return-path';
import { errorMessage } from '../lib/messages';
import { useSession } from './providers';
import { useChatCommand } from './use-chat-command';
import { Chat } from './chat';
import { Button } from './ui/button';
export function ChatStart({ branchId }: { branchId: string }) {
  const session = useSession(),
    returnTo = '/hostels/' + branchId;
  if (session.isPending) return <p role="status">Checking message access…</p>;
  if (session.error || !session.data)
    return (
      <Link className="text-link" href={authenticationPath('login', returnTo)}>
        Sign in to message this hostel
      </Link>
    );
  if (!session.data.capabilities.customer)
    return (
      <Link className="text-link" href={customerProfilePath(returnTo)}>
        Complete your Customer profile to message this hostel
      </Link>
    );
  return (
    <Start
      key={session.data.user.id + ':' + branchId}
      actorId={session.data.user.id}
      branchId={branchId}
    />
  );
}
function Start({ actorId, branchId }: { actorId: string; branchId: string }) {
  const { mutation, locked } = useChatCommand(actorId),
    [conversationId, setConversationId] = useState<string>();
  const options = {
    onSuccess: (value: unknown) => setConversationId(conversationSchema.parse(value).id),
  };
  if (conversationId) return <Chat actorId={actorId} initialConversationId={conversationId} />;
  return (
    <section aria-label="Message this hostel" className="space-y-3">
      <Button
        disabled={locked}
        onClick={() => mutation.mutate({ kind: 'create', body: { branchId } }, options)}
      >
        Message this hostel
      </Button>
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {locked && !mutation.isPending ? (
        <Button onClick={() => mutation.mutate(undefined, options)}>
          Retry original conversation request
        </Button>
      ) : null}
    </section>
  );
}
