'use client';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supportCategorySchema } from '@hsm/contracts';
import {
  acceptAdminInvitation,
  openSupportTicket,
  readOwnAdmin,
  readOwnTicket,
  readOwnTickets,
  replyOwnTicket,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import { OwnSupportThread } from './own-support-thread';
const statusText: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_for_user: 'Waiting for your reply',
  resolved: 'Resolved',
  closed: 'Closed',
};
// ADM-009: platform Help & Support (account, listing, technical); hostel issues use complaints.
export function HelpSupport({ actorId }: { actorId: string }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string>();
  const [form, setForm] = useState({ subject: '', category: 'account', body: '', reply: '' });
  const listKey = ['own-tickets', actorId];
  const list = useInfiniteQuery({
    queryKey: listKey,
    enabled: open,
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      readOwnTickets(browserClient(), { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: ['own-ticket', actorId, selected],
    enabled: Boolean(selected),
    gcTime: 0,
    queryFn: () => readOwnTicket(browserClient(), selected),
  });
  const create = useCommand(
    'HelpSupport:create',
    (input: Record<string, unknown>, k) => openSupportTicket(browserClient(), input, k),
    [listKey],
  );
  const reply = useCommand(
    'HelpSupport:reply',
    (input: { id: string; body: string }, k) =>
      replyOwnTicket(browserClient(), input.id, { body: input.body }, k),
    [listKey, ['own-ticket', actorId, selected], ['own-ticket-messages', actorId, selected]],
  );
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Help &amp; Support
      </Button>
    );
  return (
    <section aria-label="Help and support" className="space-y-2">
      <CommandRecovery command={create} />
      <CommandRecovery command={reply} />
      <h3 className="font-semibold">Help &amp; Support</h3>
      <p>
        For problems with your room or hostel services, raise a complaint from your Stay instead.
      </p>
      {create.isError || reply.isError ? (
        <p role="alert">{errorMessage(create.error ?? reply.error)}</p>
      ) : null}
      {create.isSuccess ? <p role="status">Ticket sent to HSM support.</p> : null}
      {list.isError ? <p role="alert">{errorMessage(list.error)}</p> : null}
      {(list.isError ? [] : (list.data?.pages.flatMap((p) => p.data) ?? [])).map((row) => (
        <Button key={row.id} variant="ghost" onClick={() => setSelected(row.id)}>
          {row.subject}: {statusText[row.status]}
        </Button>
      ))}
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={list.isFetching}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          Load more support tickets
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={list.isFetching}
        onClick={() => {
          void list.refetch();
        }}
      >
        Refresh support tickets
      </Button>
      {detail.data ? (
        <div className="space-y-1">
          <OwnSupportThread key={detail.data.id} actorId={actorId} ticketId={detail.data.id} />
          {detail.data.status !== 'closed' ? (
            <>
              <textarea
                aria-label="Your reply"
                className="field-input"
                maxLength={4000}
                value={form.reply}
                onChange={(event) => setForm({ ...form, reply: event.target.value })}
              />
              <Button
                disabled={!form.reply.trim()}
                onClick={() =>
                  reply.mutate(
                    { id: detail.data.id, body: form.reply.trim() },
                    { onSuccess: () => setForm({ ...form, reply: '' }) },
                  )
                }
              >
                Send reply
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      <input
        aria-label="Ticket subject"
        className="field-input"
        maxLength={160}
        value={form.subject}
        onChange={(event) => setForm({ ...form, subject: event.target.value })}
      />
      <select
        aria-label="Ticket category"
        className="field-input"
        value={form.category}
        onChange={(event) => setForm({ ...form, category: event.target.value })}
      >
        {supportCategorySchema.options.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
      <textarea
        aria-label="Describe the problem"
        className="field-input"
        maxLength={4000}
        value={form.body}
        onChange={(event) => setForm({ ...form, body: event.target.value })}
      />
      <Button
        disabled={!form.subject.trim() || !form.body.trim() || create.isPending}
        onClick={() =>
          create.mutate(
            { subject: form.subject.trim(), category: form.category, body: form.body.trim() },
            { onSuccess: () => setForm({ subject: '', category: 'account', body: '', reply: '' }) },
          )
        }
      >
        Open ticket
      </Button>
    </section>
  );
}
// ADM-002: an invited admin activates their own access; nothing shows for other accounts.
export function AdminInvitation({ actorId }: { actorId: string }) {
  const key = ['own-admin', actorId];
  const own = useQuery({
    queryKey: key,
    gcTime: 0,
    retry: false,
    queryFn: () => readOwnAdmin(browserClient()),
  });
  const accept = useCommand(
    'AdminInvitation:accept',
    (_input: null, k) => acceptAdminInvitation(browserClient(), k),
    [key],
  );
  if (own.data?.status !== 'invited') return null;
  return (
    <section aria-label="Admin invitation" className="space-y-1">
      <CommandRecovery command={accept} />
      <p>You were invited to help run HSM as {own.data.roles.join(', ')}.</p>
      {accept.isError ? <p role="alert">{errorMessage(accept.error)}</p> : null}
      <Button disabled={accept.isPending} onClick={() => accept.mutate(null)}>
        Accept admin invitation
      </Button>
    </section>
  );
}
