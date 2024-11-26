import { mobileSurfaces } from '@hsm/ui';
import { useLayoutEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { reportReasonSchema, type ChatReportInput } from '@hsm/contracts';
import { safeMessage } from '../lib/messages';
import { useChatCommand } from './use-chat-command';
import { Button, Copy } from './ui';
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
    <View
      style={mobileSurfaces.icyCard}
      className="gap-3 rounded-input border border-border p-4 frosted-card"
    >
      <Copy>Report selected message</Copy>
      <Copy>
        Authorized safety staff may review this message and a small surrounding window. This does
        not grant access to your entire conversation.
      </Copy>
      {mutation.isSuccess ? (
        <Copy>Report submitted for review.</Copy>
      ) : (
        <>
          <Copy>Report reason: {reason.replaceAll('_', ' ')}</Copy>
          {reportReasonSchema.options.map((value) => (
            <Button
              key={value}
              secondary={reason !== value}
              disabled={disabled || locked}
              label={value.replaceAll('_', ' ')}
              onPress={() => setReason(value)}
            />
          ))}
          <Copy>Report details (optional)</Copy>
          <TextInput
            accessibilityLabel="Report details"
            multiline
            style={mobileSurfaces.icyCard}
            className="rounded-input border border-border p-3 text-text frosted-card"
            maxLength={4000}
            editable={!disabled && !locked}
            value={details}
            onChangeText={setDetails}
          />
          <Button
            disabled={disabled || locked}
            label="Submit message report"
            onPress={() =>
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
              })
            }
          />
        </>
      )}
      {mutation.isPending ? <Copy>Submitting report…</Copy> : null}
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {locked && !mutation.isPending ? (
        <Button
          disabled={disabled}
          label="Retry original report"
          onPress={() => mutation.mutate(undefined)}
        />
      ) : null}
      <Button secondary disabled={locked} label="Close report" onPress={close} />
    </View>
  );
}
