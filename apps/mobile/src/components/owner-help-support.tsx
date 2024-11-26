import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { openSupportTicket, readOwnTicket, readOwnTickets, replyOwnTicket } from '@hsm/api-client';
import { mobileOwnerColors as ownerColors } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { safeMessage } from '../lib/messages';
import { useNativeCommand } from './services/use-command';
import { DrillTile } from './owner-ui';
import {
  FieldLabel,
  SetupButton,
  SetupCard,
  SetupHeading,
  SetupText,
  StatusChip,
} from './owner-wizard-ui';
const statusText: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_for_user: 'Waiting for your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};
const input =
  'min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text';
// ADM-009: platform Help & Support tickets; hostel issues are Stay complaints instead.
export function OwnerHelpSupport({ actorId }: { actorId: string }) {
  const [selected, setSelected] = useState<string>(),
    [form, setForm] = useState({ subject: '', body: '', reply: '' }),
    [composing, setComposing] = useState(false);
  const list = useQuery({
    queryKey: ['own-tickets', actorId],
    retry: false,
    queryFn: () => withFreshSession(async () => readOwnTickets(await actorClient(actorId))),
  });
  const detail = useQuery({
    queryKey: ['own-ticket', actorId, selected],
    enabled: Boolean(selected),
    retry: false,
    queryFn: () =>
      withFreshSession(async () => readOwnTicket(await actorClient(actorId), selected)),
  });
  const refresh = [
    ['own-tickets', actorId],
    ['own-ticket', actorId, selected],
  ];
  const create = useNativeCommand(
    'NativeHelpSupport:create',
    actorId,
    (client, body: Record<string, unknown>, key) => openSupportTicket(client, body, key),
    refresh,
  );
  const reply = useNativeCommand(
    'NativeHelpSupport:reply',
    actorId,
    (client, body: { id: string; body: string }, key) =>
      replyOwnTicket(client, body.id, { body: body.body }, key),
    refresh,
  );
  const failure = list.error ?? detail.error ?? create.error ?? reply.error;
  const tickets = list.data?.data ?? [];
  if (detail.data && selected)
    return (
      <>
        <SetupCard>
          <SetupHeading>{detail.data.subject}</SetupHeading>
          <StatusChip label={statusText[detail.data.status] ?? detail.data.status} tone="info" />
          {detail.data.messages.map((message) => (
            <View key={message.id} style={{ gap: 2 }}>
              <FieldLabel>{message.fromSupport ? 'HSM support' : 'You'}</FieldLabel>
              <SetupText>{message.body}</SetupText>
            </View>
          ))}
          <FieldLabel>Your reply</FieldLabel>
          <TextInput
            accessibilityLabel="Your reply"
            value={form.reply}
            onChangeText={(text) => setForm({ ...form, reply: text })}
            maxLength={4000}
            multiline
            placeholderTextColor={ownerColors.secondary}
            className={input + ' min-h-24'}
          />
          <SetupButton
            label="Send reply"
            disabled={!form.reply.trim() || reply.isPending}
            onPress={() =>
              reply.mutate(
                { id: detail.data.id, body: form.reply.trim() },
                { onSuccess: () => setForm({ ...form, reply: '' }) },
              )
            }
          />
        </SetupCard>
        {failure ? <SetupText alert>{safeMessage(failure)}</SetupText> : null}
        <SetupButton secondary label="All requests" onPress={() => setSelected(undefined)} />
      </>
    );
  return (
    <>
      <SetupText muted>
        For account, verification or app questions. Never share passwords or codes.
      </SetupText>
      {composing ? (
        <SetupCard>
          <SetupHeading>New request</SetupHeading>
          <FieldLabel>Subject *</FieldLabel>
          <TextInput
            accessibilityLabel="Ticket subject"
            value={form.subject}
            onChangeText={(text) => setForm({ ...form, subject: text })}
            maxLength={160}
            className={input}
          />
          <FieldLabel>How can we help? *</FieldLabel>
          <TextInput
            accessibilityLabel="Describe the problem"
            value={form.body}
            onChangeText={(text) => setForm({ ...form, body: text })}
            maxLength={4000}
            multiline
            className={input + ' min-h-24'}
          />
          <SetupButton
            label={create.isPending ? 'Sending…' : 'Send request'}
            disabled={!form.subject.trim() || !form.body.trim() || create.isPending}
            onPress={() =>
              create.mutate(
                { subject: form.subject.trim(), category: 'other', body: form.body.trim() },
                {
                  onSuccess: () => {
                    setForm({ subject: '', body: '', reply: '' });
                    setComposing(false);
                  },
                },
              )
            }
          />
          <SetupButton secondary label="Cancel" onPress={() => setComposing(false)} />
        </SetupCard>
      ) : (
        <SetupButton label="New request" onPress={() => setComposing(true)} />
      )}
      {create.isSuccess && !composing ? <SetupText>Request sent to HSM support.</SetupText> : null}
      <SetupCard>
        <SetupHeading>Your requests</SetupHeading>
        {list.isPending ? <Skeleton kind="list" label="Loading requests…" /> : null}
        {list.data && !tickets.length ? <SetupText muted>No requests yet.</SetupText> : null}
        {tickets.map((row) => (
          <DrillTile
            key={row.id}
            title={row.subject}
            detail={statusText[row.status] ?? row.status}
            onPress={() => setSelected(row.id)}
          />
        ))}
      </SetupCard>
      {failure ? <SetupText alert>{safeMessage(failure)}</SetupText> : null}
    </>
  );
}
