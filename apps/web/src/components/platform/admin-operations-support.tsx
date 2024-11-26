'use client';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  actOnSupportTicket,
  readAdminSupportMessages,
  readAdminSupportQueue,
  readSupportTicket,
} from '@hsm/api-client';
import { supportPrioritySchema, supportStatusSchema } from '@hsm/contracts';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import {
  OperationConfirmation,
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
type Scope = ReturnType<typeof useOperationScope>;
export function SupportOperations({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'support', 'support');
  const [status, setStatus] = useState(''),
    [priority, setPriority] = useState(''),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [open, setOpen] = useState<string>();
  const queue = useInfiniteQuery({
    queryKey: [...scope.key, status, priority, query],
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readAdminSupportQueue(c, {
            limit: 20,
            ...(status ? { status } : {}),
            ...(priority ? { priority } : {}),
            ...(query ? { q: query } : {}),
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = queue.isError ? [] : (queue.data?.pages.flatMap((page) => page.data) ?? []);
  return (
    <OperationSection title="Support tickets">
      <p>Staff Help &amp; Support queue. Internal notes stay within authorized staff access.</p>
      <label>
        Ticket status
        <select
          aria-label="Support status filter"
          className="field-input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOpen(undefined);
          }}
        >
          <option value="">All statuses</option>
          {supportStatusSchema.options.map((value) => (
            <option value={value} key={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ticket priority
        <select
          aria-label="Support priority filter"
          className="field-input"
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setOpen(undefined);
          }}
        >
          <option value="">All priorities</option>
          {supportPrioritySchema.options.map((value) => (
            <option value={value} key={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Search staff tickets
        <input
          aria-label="Search staff tickets"
          className="field-input"
          maxLength={160}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <Button
        variant="secondary"
        onClick={() => {
          setQuery(search.trim());
          setOpen(undefined);
        }}
      >
        Search tickets
      </Button>
      <OperationState
        pending={queue.isPending}
        error={queue.error}
        retry={() => void queue.refetch()}
        empty={!rows.length}
      />
      {rows.map((ticket) => (
        <Button variant="secondary" key={ticket.id} onClick={() => setOpen(ticket.id)}>
          {ticket.subject} · {ticket.priority} · {ticket.status}
        </Button>
      ))}
      {!queue.isError && !queue.isPending ? (
        <OperationPages
          hasMore={Boolean(queue.hasNextPage)}
          fetching={queue.isFetching}
          more={() => void queue.fetchNextPage()}
          refresh={() => void queue.refetch()}
        />
      ) : null}
      {open ? (
        <SupportDetail key={open} ticketId={open} scope={scope} close={() => setOpen(undefined)} />
      ) : null}
    </OperationSection>
  );
}
function SupportDetail({
  ticketId,
  scope,
  close,
}: {
  ticketId: string;
  scope: Scope;
  close: () => void;
}) {
  const detail = useQuery({
    queryKey: [...scope.key, 'detail', ticketId],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => scope.read((c) => readSupportTicket(c, ticketId), signal),
  });
  const messages = useInfiniteQuery({
    queryKey: [...scope.key, 'messages', ticketId],
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readAdminSupportMessages(c, ticketId, {
            limit: 50,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const ticket = !detail.isError && !detail.isFetching ? detail.data : undefined;
  return (
    <div className="space-y-4 border-t border-hsm-border pt-4">
      <Button variant="secondary" onClick={close}>
        Close staff ticket
      </Button>
      <OperationState
        pending={detail.isPending || detail.isFetching}
        error={detail.error}
        retry={() => void detail.refetch()}
      />
      {ticket ? (
        <>
          <h4 className="font-semibold">{ticket.subject}</h4>
          <p>
            {ticket.status} · {ticket.priority} · Assigned: {ticket.assignedToName ?? 'Unassigned'}
          </p>
          <SupportAction key={ticket.version} ticket={ticket} scope={scope} />
        </>
      ) : null}
      <h4 className="font-semibold">Ticket conversation</h4>
      <OperationState
        pending={messages.isPending}
        error={messages.error}
        retry={() => void messages.refetch()}
        empty={!messages.data?.pages.some((page) => page.data.length)}
      />
      {!messages.isError ? (
        <ol aria-label="Staff ticket messages">
          {messages.data?.pages
            .flatMap((page) => page.data)
            .map((message) => (
              <li key={message.id}>
                <p>
                  {message.authorName} · {message.createdAt}
                  {message.internal ? ' · Internal staff note' : ' · Public reply'}
                </p>
                <p>{message.body}</p>
              </li>
            ))}
        </ol>
      ) : null}
      {!messages.isError && messages.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={messages.isFetching}
          onClick={() => void messages.fetchNextPage()}
        >
          Load more ticket messages
        </Button>
      ) : null}
    </div>
  );
}
function SupportAction({
  ticket,
  scope,
}: {
  ticket: Awaited<ReturnType<typeof readSupportTicket>>;
  scope: Scope;
}) {
  const [body, setBody] = useState(''),
    [internal, setInternal] = useState(false),
    [assign, setAssign] = useState(false),
    [status, setStatus] = useState(ticket.status),
    [priority, setPriority] = useState(ticket.priority),
    [reviewing, setReviewing] = useState(false);
  const command = useCommand(
    'AdminSupport:action',
    (change: Record<string, unknown>, key) =>
      scope.read((c) => actOnSupportTicket(c, ticket.id, change, key)),
    [scope.key],
  );
  const locked = command.isPending || command.unresolved;
  const changed = Boolean(
    body.trim() || assign || status !== ticket.status || priority !== ticket.priority,
  );
  const input = {
    expectedVersion: ticket.version,
    ...(body.trim() ? { body: body.trim(), internal } : {}),
    ...(assign ? { assignToMe: true } : {}),
    ...(status !== ticket.status ? { status } : {}),
    ...(priority !== ticket.priority ? { priority } : {}),
  };
  return (
    <div className="space-y-3">
      <CommandRecovery command={command} />
      <label>
        Support reply
        <textarea
          aria-label="Support reply"
          className="field-input"
          maxLength={4000}
          value={body}
          disabled={locked || reviewing}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label>
        <input
          aria-label="Internal staff note"
          type="checkbox"
          checked={internal}
          disabled={locked || reviewing}
          onChange={(e) => setInternal(e.target.checked)}
        />{' '}
        Internal staff note (not sent to participant)
      </label>
      <label>
        <input
          aria-label="Assign ticket to me"
          type="checkbox"
          checked={assign}
          disabled={locked || reviewing}
          onChange={(e) => setAssign(e.target.checked)}
        />{' '}
        Assign ticket to me
      </label>
      <label>
        Ticket status
        <select
          aria-label="Support ticket status"
          className="field-input"
          value={status}
          disabled={locked || reviewing || ticket.status === 'closed'}
          onChange={(e) => setStatus(supportStatusSchema.parse(e.target.value))}
        >
          {supportStatusSchema.options.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      {ticket.status === 'closed' ? <p>Closed tickets cannot change status.</p> : null}
      <label>
        Ticket priority
        <select
          aria-label="Support ticket priority"
          className="field-input"
          value={priority}
          disabled={locked || reviewing}
          onChange={(e) => setPriority(supportPrioritySchema.parse(e.target.value))}
        >
          {supportPrioritySchema.options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      {reviewing ? (
        <OperationConfirmation
          label="support update"
          pending={command.isPending}
          disabled={command.unresolved}
          cancel={() => setReviewing(false)}
          confirm={() =>
            command.mutate(input, {
              onSuccess: () => {
                setBody('');
                setReviewing(false);
              },
            })
          }
        />
      ) : (
        <Button disabled={!changed || locked} onClick={() => setReviewing(true)}>
          Review support update
        </Button>
      )}
      {command.isError ? (
        <p role="alert">
          {errorMessage(command.error)} Refresh this ticket before updating a stale version.
        </p>
      ) : null}
      {command.isSuccess ? <p role="status">Support update recorded by server.</p> : null}
    </div>
  );
}
