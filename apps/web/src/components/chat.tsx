'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBranchConversations, listOwnConversations } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { ChatThread } from './chat-thread';
type Props = {
  actorId: string;
  branchId?: string;
  accessUnavailable?: boolean;
  initialConversationId?: string;
};
export function Chat(props: Props) {
  return <Workspace key={props.actorId + ':' + (props.branchId ?? 'own')} {...props} />;
}
function Workspace({ actorId, branchId, accessUnavailable = false, initialConversationId }: Props) {
  const [open, setOpen] = useState(Boolean(initialConversationId)),
    [selected, setSelected] = useState(initialConversationId),
    [cursor, setCursor] = useState<string>(),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['chat', actorId, branchId ?? 'own', 'conversations', cursor],
    gcTime: 0,
    retry: false,
    enabled: open && !accessUnavailable,
    queryFn: () =>
      branchId
        ? listBranchConversations(browserClient(), branchId, cursor ? { cursor } : {})
        : listOwnConversations(browserClient(), actorId, cursor ? { cursor } : {}),
  });
  const unavailable = accessUnavailable || query.isError;
  return (
    <section
      id={branchId ? undefined : 'messages'}
      aria-label={branchId ? 'Hostel messages' : 'My messages'}
      className="space-y-4"
    >
      <Button variant="secondary" disabled={busy} onClick={() => setOpen(!open)}>
        {open ? 'Close messages' : branchId ? 'Hostel messages' : 'My messages'}
      </Button>
      {open ? (
        <>
          {unavailable ? (
            <p role="alert">
              {accessUnavailable
                ? 'Refresh branch access before continuing.'
                : errorMessage(query.error)}
            </p>
          ) : query.isFetching || query.isPending ? (
            <p role="status">Loading conversations…</p>
          ) : (
            <>
              {!query.data?.data.length ? (
                <p>No conversations on this page. Open a hostel listing to start a conversation.</p>
              ) : null}
              <ul className="space-y-2">
                {query.data?.data.map((row) => (
                  <li key={row.id}>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-pressed={selected === row.id}
                      onClick={() => setSelected(row.id)}
                    >
                      {branchId ? row.customerName : row.branchName} — {row.unreadCount} unread
                    </Button>
                  </li>
                ))}
              </ul>
              {query.data?.nextCursor ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setCursor(query.data.nextCursor ?? undefined)}
                >
                  More conversations
                </Button>
              ) : null}
              {cursor ? (
                <Button variant="secondary" disabled={busy} onClick={() => setCursor(undefined)}>
                  First conversation page
                </Button>
              ) : null}
            </>
          )}
          <Button
            variant="secondary"
            disabled={accessUnavailable || query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh conversations
          </Button>
          {selected ? (
            <ChatThread
              key={selected}
              actorId={actorId}
              conversationId={selected}
              {...(branchId ? { branchId } : {})}
              accessUnavailable={unavailable || query.isFetching || query.isPending}
              onBusy={setBusy}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
