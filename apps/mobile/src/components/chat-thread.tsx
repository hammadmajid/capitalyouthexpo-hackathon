import { Skeleton } from './loading/skeleton';
import { useLayoutEffect, useState, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronUp, MessageCircle } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { readChatMessages } from '@hsm/api-client';
import { mobileColors as c } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { AppHeader } from './navigation/header';
import { useChatCommand } from './use-chat-command';
import { useChatRealtime } from './use-chat-realtime';
import { ChatReport } from './chat-report';
import { ChatBubble } from './chat-bubble';
import { ChatComposer } from './chat-composer';
// COMM-001: one conversation — Back, live dot, bubbles, then the attach/type/send bar.
export function ChatThread({
  actorId,
  conversationId,
  branchId,
  title,
  accessUnavailable,
  onBusy,
  onBack,
}: {
  actorId: string;
  conversationId: string;
  branchId?: string;
  title: string;
  accessUnavailable: boolean;
  onBusy(busy: boolean): void;
  onBack(): void;
}) {
  const { mutation, locked: commandLocked } = useChatCommand(actorId),
    // Read receipts use their own command, so they never hold up or replace a send.
    read = useChatCommand(actorId),
    { state, reconnect } = useChatRealtime(actorId, conversationId, branchId);
  const [reportMessage, setReportMessage] = useState<string>(),
    [reportBusy, setReportBusy] = useState(false);
  const locked = commandLocked || reportBusy;
  const [body, setBody] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [attachmentIds, setAttachmentIds] = useState<string[]>([]),
    [uploadBusy, setUploadBusy] = useState(false),
    [uploadPending, setUploadPending] = useState(false),
    [uploadRevision, setUploadRevision] = useState(0);
  function clearDraft() {
    setBody('');
    setAttachmentIds([]);
    setUploadPending(false);
    setUploadRevision((value) => value + 1);
    setCursor(undefined);
  }
  const query = useQuery({
    queryKey: ['chat', actorId, branchId ?? 'own', conversationId, cursor],
    gcTime: 0,
    retry: false,
    enabled: !accessUnavailable,
    queryFn: async () =>
      readChatMessages(
        await actorClient(actorId),
        conversationId,
        cursor ? { cursor } : {},
        branchId,
      ),
  });
  // Pull-to-refresh reloads the messages; a dropped live connection reconnects with it.
  const loadedAt = query.dataUpdatedAt;
  useEffect(() => {
    if (loadedAt && state === 'disconnected') reconnect();
  }, [loadedAt]);
  useLayoutEffect(() => {
    onBusy(locked || uploadBusy || Boolean(reportMessage));
    return () => onBusy(false);
  }, [locked, uploadBusy, reportMessage, onBusy]);
  const unavailable = accessUnavailable || query.isError || state === 'denied',
    hidden = unavailable || query.isPending || query.isFetching;
  // Opening the latest messages marks them read; no separate button.
  const newest = cursor ? undefined : query.data?.data[0];
  const marked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!newest || newest.senderUserId === actorId || marked.current === newest.id) return;
    if (read.locked) return;
    marked.current = newest.id;
    read.mutation.mutate({ kind: 'read', conversationId, branchId: branchId ?? null });
  }, [newest?.id]);
  function send() {
    if (hidden || locked || uploadBusy || uploadPending || (!body.trim() && !attachmentIds.length))
      return;
    mutation.mutate(
      {
        kind: 'send',
        conversationId,
        branchId: branchId ?? null,
        body: {
          ...(body.trim() ? { body } : {}),
          ...(attachmentIds.length ? { attachmentFileIds: attachmentIds } : {}),
        },
      },
      { onSuccess: clearDraft },
    );
  }
  const busy = locked || uploadBusy || Boolean(reportMessage);
  return (
    <View className="gap-3" accessibilityLabel="Conversation">
      <AppHeader
        title={title}
        backLabel="Back to messages"
        backDisabled={busy}
        onBack={onBack}
        actions={<LiveDot state={state} />}
      />
      {unavailable ? (
        <Copy alert>
          {state === 'denied'
            ? 'Pull down to restore message access.'
            : accessUnavailable
              ? 'Refreshing conversation access…'
              : safeMessage(query.error)}
        </Copy>
      ) : query.isPending ? (
        <Skeleton kind="chat" label="Loading current messages…" />
      ) : (
        <View className="gap-3">
          {query.data?.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Older messages"
              disabled={locked}
              onPress={() => setCursor(query.data.nextCursor ?? undefined)}
              style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <ChevronUp size={18} color={c.primary} />
              <Text className="font-heading" style={{ color: c.primary }}>
                Older
              </Text>
            </Pressable>
          ) : null}
          {!query.data?.data.length ? <EmptyThread /> : null}
          {[...(query.data?.data ?? [])].reverse().map((row) => (
            <ChatBubble
              key={row.id}
              row={row}
              mine={row.senderUserId === actorId}
              actorId={actorId}
              conversationId={conversationId}
              {...(branchId ? { branchId } : {})}
              reportDisabled={busy}
              onReport={() => setReportMessage(row.id)}
            />
          ))}
          {cursor ? (
            <Button
              secondary
              disabled={locked}
              label="Latest messages"
              onPress={() => setCursor(undefined)}
            />
          ) : null}
        </View>
      )}
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {reportMessage ? (
        <ChatReport
          key={reportMessage}
          actorId={actorId}
          conversationId={conversationId}
          messageId={reportMessage}
          {...(branchId ? { branchId } : {})}
          disabled={hidden || commandLocked || uploadBusy}
          onBusy={setReportBusy}
          close={() => setReportMessage(undefined)}
        />
      ) : null}
      {commandLocked && !mutation.isPending ? (
        <Button
          disabled={hidden}
          label="Retry original message action"
          onPress={() => mutation.mutate(undefined, { onSuccess: clearDraft })}
        />
      ) : null}
      <ChatComposer
        actorId={actorId}
        body={body}
        onBody={setBody}
        attachmentIds={attachmentIds}
        onAttachments={setAttachmentIds}
        uploadPending={uploadPending}
        onUploadPending={setUploadPending}
        uploadRevision={uploadRevision}
        onUploadRevision={() => setUploadRevision((value) => value + 1)}
        onUploadBusy={setUploadBusy}
        uploadBusy={uploadBusy}
        locked={locked}
        hidden={hidden}
        onSend={send}
      />
    </View>
  );
}
function EmptyThread() {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 28 }}>
      <MessageCircle size={44} color={c.primary} />
      <Text className="font-heading" style={{ color: c.heading, fontSize: 16 }}>
        No messages yet
      </Text>
    </View>
  );
}
// Green when live updates are connected; grey otherwise (pull down refreshes). No text.
function LiveDot({ state }: { state: string }) {
  const live = state === 'connected';
  return (
    <View
      accessible
      accessibilityLabel={live ? 'Live' : 'Offline'}
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 6,
        backgroundColor: live ? c.primary : c.placeholder,
      }}
    />
  );
}
