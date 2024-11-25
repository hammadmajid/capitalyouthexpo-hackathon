'use client';
import { useLayoutEffect, useState } from 'react';
import { reportReasonSchema, type ChatReportInput } from '@hsm/contracts';
import { errorMessage } from '../lib/messages';
import { useChatCommand } from './use-chat-command';
import { Button } from './ui/button';
export function ChatReport({
  actorId,
  conversationId,
  branchId,
  messageId,
  disabled,
  onBusy,
  close,
}: {
  actorId: string;
  conversationId: string;
  branchId?: string;
  messageId: string;
  disabled: boolean;
  onBusy(busy: boolean): void;
  close(): void;
}) {
  const [reason, setReason] = useState<ChatReportInput['reason']>('inappropriate_chat'),
    [details, setDetails] = useState('');
  const { mutation, locked } = useChatCommand(actorId);
  useLayoutEffect(() => {
    onBusy(locked);
    return () => onBusy(false);
  }, [locked, onBusy]);
  return (
    <section
      aria-label="Report selected message"
      className="space-y-3 rounded-card border border-hsm-border p-4"
    >
      <h4 className="font-semibold">Report selected message</h4>
      <p>
        Authorized safety staff may review this message and a small surrounding window. This does
        not grant access to your entire conversation.
      </p>
      {mutation.isSuccess ? (
        <p role="status">Report submitted for review.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled || locked) return;
            mutation.mutate({
              kind: 'report',
              conversationId,
              branchId: branchId ?? null,
              body: {
                targetType: 'chat_message',
                targetId: messageId,
                reason,
                ...(details.trim() ? { details } : {}),
              },
            });
          }}
        >
          <label className="field-label" htmlFor={'report-reason-' + messageId}>
            Report reason
          </label>
          <select
            className="field-input"
            id={'report-reason-' + messageId}
            disabled={disabled || locked}
            value={reason}
            onChange={(event) => setReason(reportReasonSchema.parse(event.target.value))}
          >
            {reportReasonSchema.options.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor={'report-details-' + messageId}>
            Report details (optional)
          </label>
          <textarea
            className="field-input"
            id={'report-details-' + messageId}
            maxLength={4000}
            disabled={disabled || locked}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
          <Button type="submit" disabled={disabled || locked}>
            Submit message report
          </Button>
        </form>
      )}
      {mutation.isPending ? <p role="status">Submitting report…</p> : null}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {locked && !mutation.isPending ? (
        <Button disabled={disabled} onClick={() => mutation.mutate(undefined)}>
          Retry original report
        </Button>
      ) : null}
      <Button variant="secondary" disabled={locked} onClick={close}>
        Close report
      </Button>
    </section>
  );
}
