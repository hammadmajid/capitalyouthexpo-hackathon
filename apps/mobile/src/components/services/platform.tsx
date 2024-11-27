import { Skeleton } from '../loading/skeleton';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { openSupportTicket, readOwnTicket, readOwnTickets, replyOwnTicket } from '@hsm/api-client';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { Copy } from '../ui';
import { MarketplaceAction as Button } from '../marketplace/action';
import { field } from './resident';
import { useNativeCommand } from './use-command';
import { NativeCommandRecovery } from './command-recovery';
import { OwnSupportThread } from './support-thread';
const statusText: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_for_user: 'Waiting for your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};
// ADM-009: platform Help & Support; hostel issues are raised as Stay complaints instead.
export function NativeHelpSupport({
  actorId,
  standalone = false,
}: {
  actorId: string;
  standalone?: boolean;
}) {
  const [open, setOpen] = useState(standalone),
    [selected, setSelected] = useState<string>(),
    [form, setForm] = useState({ subject: '', body: '', reply: '' });
  const list = useInfiniteQuery({
    queryKey: ['own-tickets', actorId],
    enabled: open,
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      readOwnTickets(await actorClient(actorId), {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: ['own-ticket', actorId, selected],
    enabled: Boolean(selected),
    gcTime: 0,
    queryFn: async () => readOwnTicket(await actorClient(actorId), selected),
  });
  const refresh = [
    ['own-tickets', actorId],
    ['own-ticket', actorId, selected],
    ['own-ticket-messages', actorId, selected],
  ];
  const create = useNativeCommand(
    'NativeHelpSupport:create',
    actorId,
    (c, input: Record<string, unknown>, key) => openSupportTicket(c, input, key),
    refresh,
  );
  const reply = useNativeCommand(
    'NativeHelpSupport:reply',
    actorId,
    (c, input: { id: string; body: string }, key) =>
      replyOwnTicket(c, input.id, { body: input.body }, key),
    refresh,
  );
  if (!open) return <Button secondary label="Help & Support" onPress={() => setOpen(true)} />;
  return (
    <View
      className="gap-3 rounded-card border border-cardBorder bg-icy p-4"
      accessibilityLabel="Help and support"
    >
      <NativeCommandRecovery command={create} />
      <NativeCommandRecovery command={reply} />
      <Copy>For hostel issues, open My stays.</Copy>
      {list.isPending ? <Skeleton kind="list" label="Loading support tickets…" /> : null}
      {list.isSuccess && list.data.pages.every((page) => !page.data.length) ? (
        <Copy>No support tickets.</Copy>
      ) : null}
      {create.isError || reply.isError ? (
        <Copy alert>{safeMessage(create.error ?? reply.error)}</Copy>
      ) : null}
      {create.isSuccess ? <Copy>Ticket sent to HSM support.</Copy> : null}
      {list.isError ? <Copy alert>{safeMessage(list.error)}</Copy> : null}
      {(list.isError ? [] : (list.data?.pages.flatMap((p) => p.data) ?? [])).map((row) => (
        <Button
          key={row.id}
          secondary
          label={`${row.subject}: ${statusText[row.status]}`}
          onPress={() => setSelected(row.id)}
        />
      ))}
      {list.hasNextPage ? (
        <Button
          secondary
          label="Load more support tickets"
          disabled={list.isFetching}
          onPress={() => {
            void list.fetchNextPage();
          }}
        />
      ) : null}

      {detail.data ? (
        <>
          <OwnSupportThread key={detail.data.id} actorId={actorId} ticketId={detail.data.id} />
          <TextInput
            accessibilityLabel="Your reply"
            value={form.reply}
            onChangeText={(text) => setForm({ ...form, reply: text })}
            maxLength={4000}
            className={field}
          />
          <Button
            label="Send reply"
            disabled={!form.reply.trim()}
            onPress={() => reply.mutate({ id: detail.data.id, body: form.reply.trim() })}
          />
        </>
      ) : null}
      <TextInput
        accessibilityLabel="Ticket subject"
        placeholder="Subject"
        value={form.subject}
        onChangeText={(text) => setForm({ ...form, subject: text })}
        maxLength={160}
        className={field}
      />
      <TextInput
        accessibilityLabel="Describe the problem"
        placeholder="Describe the problem"
        value={form.body}
        onChangeText={(text) => setForm({ ...form, body: text })}
        maxLength={4000}
        multiline
        className={field}
      />
      <Button
        label="Open ticket"
        disabled={!form.subject.trim() || !form.body.trim() || create.isPending}
        onPress={() =>
          create.mutate({ subject: form.subject.trim(), category: 'other', body: form.body.trim() })
        }
      />
    </View>
  );
}
