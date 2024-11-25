'use client';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readChatMessages, subscribeChatRealtime, type ChatRealtimeState } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { useChatCommand } from './use-chat-command';
import { PrivateFileInput } from './private-file-input';
import { ChatAttachment } from './chat-attachment';
import { karachiDateTime } from '../lib/karachi-time';
import { ChatReport } from './chat-report';
export function ChatThread({
  actorId,
  conversationId,
  branchId,
  accessUnavailable,
  onBusy,
}: {
  actorId: string;
  conversationId: string;
  branchId?: string;
  accessUnavailable: boolean;
  onBusy(busy: boolean): void;
}) {
  const cache = useQueryClient(),
    { mutation, locked: commandLocked } = useChatCommand(actorId);
  const [reportMessage, setReportMessage] = useState<string>(),
    [reportBusy, setReportBusy] = useState(false);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const locked = commandLocked || reportBusy;
  const [body, setBody] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [state, setState] = useState<ChatRealtimeState>('connecting'),
    [action, setAction] = useState<'send' | 'read'>();
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]),
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
    queryFn: () =>
      readChatMessages(browserClient(), conversationId, cursor ? { cursor } : {}, branchId),
  });
  useLayoutEffect(() => {
    onBusy(locked || uploadBusy || Boolean(reportMessage));
    return () => onBusy(false);
  }, [locked, uploadBusy, reportMessage, onBusy]);
  useEffect(
    () =>
      subscribeChatRealtime({
        url: window.location.origin,
        path: '/api/v1/rt',
        conversationId,
        branchId,
        browser: true,
        state: setState,
        refresh: () => {
          void cache.invalidateQueries({ queryKey: ['chat', actorId] });
        },
      }),
    [actorId, branchId, conversationId, cache, connectionRevision],
  );
  const unavailable = accessUnavailable || query.isError || state === 'denied',
    hidden = unavailable || query.isPending || query.isFetching;
  return (
    <section
      aria-label="Conversation"
      className="space-y-3 rounded-card border border-hsm-border p-4"
    >
      <h3 className="text-lg font-semibold">Conversation</h3>
      <p role="status">
        {state === 'connected'
          ? 'Live updates connected'
          : state === 'connecting'
            ? 'Connecting live updates…'
            : 'Live updates disconnected. Refresh to check for messages.'}
      </p>
      {unavailable ? (
        <p role="alert">
          {state === 'denied'
            ? 'Sign in again to restore message access.'
            : accessUnavailable
              ? 'Refreshing conversation access…'
              : errorMessage(query.error)}
        </p>
      ) : hidden ? (
        <p role="status">Loading current messages…</p>
      ) : (
        <>
          {!query.data?.data.length ? <p>No messages yet.</p> : null}
          <ol className="space-y-3">
            {[...(query.data?.data ?? [])].reverse().map((row) => (
              <li key={row.id} className="rounded-card border border-hsm-border p-3">
                <p className="font-semibold">
                  {row.senderUserId === actorId ? 'You' : row.senderName} —{' '}
                  {karachiDateTime(row.createdAt)}
                </p>
                {row.body ? <p className="whitespace-pre-wrap break-words">{row.body}</p> : null}
                {row.attachmentFileIds.map((fileId) => (
                  <ChatAttachment
                    key={fileId}
                    conversationId={conversationId}
                    fileId={fileId}
                    {...(branchId ? { branchId } : {})}
                  />
                ))}
                <Button
                  variant="secondary"
                  disabled={locked || uploadBusy || Boolean(reportMessage)}
                  onClick={() => setReportMessage(row.id)}
                >
                  Report this message
                </Button>
              </li>
            ))}
          </ol>
          {query.data?.nextCursor ? (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => setCursor(query.data.nextCursor ?? undefined)}
            >
              Older messages
            </Button>
          ) : null}
          {cursor ? (
            <Button variant="secondary" disabled={locked} onClick={() => setCursor(undefined)}>
              Latest messages
            </Button>
          ) : null}
        </>
      )}
      <Button
        variant="secondary"
        disabled={accessUnavailable || query.isFetching}
        onClick={() => {
          setCursor(undefined);
          setConnectionRevision((value) => value + 1);
          void query.refetch();
        }}
      >
        Refresh messages
      </Button>
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
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
      {mutation.isPending ? (
        <p role="status">{action === 'send' ? 'Sending message…' : 'Updating read state…'}</p>
      ) : mutation.isSuccess ? (
        <p role="status">{action === 'send' ? 'Message sent.' : 'Conversation marked read.'}</p>
      ) : null}
      {commandLocked && !mutation.isPending ? (
        <Button
          disabled={hidden}
          onClick={() =>
            mutation.mutate(undefined, {
              onSuccess: () => {
                if (action === 'send') {
                  clearDraft();
                }
              },
            })
          }
        >
          Retry original message action
        </Button>
      ) : null}
      <PrivateFileInput
        key={uploadRevision}
        id={'chat-file-' + conversationId}
        label="Attach JPEG, PNG or PDF"
        purpose="chat_attachment"
        disabled={locked || hidden || attachmentIds.length >= 5}
        onBusy={setUploadBusy}
        onPending={setUploadPending}
        onReady={(fileId) => {
          if (fileId) {
            setAttachmentIds((ids) => [...new Set([...ids, fileId])]);
            setUploadRevision((value) => value + 1);
          }
        }}
      />
      {uploadPending ? (
        <Button
          variant="secondary"
          disabled={locked || uploadBusy}
          onClick={() => {
            setUploadPending(false);
            setUploadRevision((value) => value + 1);
          }}
        >
          Discard pending attachment
        </Button>
      ) : null}
      {attachmentIds.map((fileId, index) => (
        <Button
          key={fileId}
          variant="secondary"
          disabled={locked || uploadBusy || hidden}
          onClick={() => setAttachmentIds((ids) => ids.filter((id) => id !== fileId))}
        >
          Remove attachment {index + 1}
        </Button>
      ))}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            hidden ||
            locked ||
            uploadBusy ||
            uploadPending ||
            (!body.trim() && !attachmentIds.length)
          )
            return;
          setAction('send');
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
            {
              onSuccess: () => {
                clearDraft();
              },
            },
          );
        }}
      >
        <label className="field-label" htmlFor={'message-' + conversationId}>
          Message
        </label>
        <textarea
          className="field-input"
          id={'message-' + conversationId}
          maxLength={4000}
          value={body}
          disabled={locked || uploadBusy || hidden}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button
          type="submit"
          disabled={
            locked ||
            uploadBusy ||
            uploadPending ||
            hidden ||
            (!body.trim() && !attachmentIds.length)
          }
        >
          Send message
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={locked || uploadBusy || hidden}
          onClick={() => {
            setAction('read');
            mutation.mutate({ kind: 'read', conversationId, branchId: branchId ?? null });
          }}
        >
          Mark conversation read
        </Button>
      </form>
    </section>
  );
}
