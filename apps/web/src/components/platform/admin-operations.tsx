'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiFailure, ClientFailure, readApi, type ApiClient } from '@hsm/api-client';
import { selfProfileSchema } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
export type StaffRole = 'verification' | 'support' | 'content_moderator';
export function useOperationScope(
  actorId: string,
  module: string,
  role: StaffRole | 'root' | 'self',
) {
  const cache = useQueryClient(),
    epoch = useRef(0);
  const key = ['platform-admin-web', actorId, module] as const;
  useEffect(
    () => () => {
      epoch.current += 1;
      void cache.cancelQueries({ queryKey: ['platform-admin-web', actorId, module] });
      cache.removeQueries({ queryKey: ['platform-admin-web', actorId, module] });
    },
    [actorId, module, cache],
  );
  async function current(client: ApiClient) {
    const profile = await readApi(client.GET('/v1/me'), selfProfileSchema);
    if (role === 'self') {
      if (profile.user.id !== actorId) throw new ClientFailure('INVALID_RESPONSE');
      return;
    }
    if (
      profile.user.id !== actorId ||
      !profile.capabilities.admin ||
      (!profile.capabilities.admin.isRoot &&
        (role === 'root' || !profile.capabilities.admin.roles.includes(role)))
    )
      throw new ClientFailure('INVALID_RESPONSE');
  }
  async function read<T>(work: (client: ApiClient) => Promise<T>, signal?: AbortSignal) {
    const ticket = epoch.current,
      client = browserClient();
    try {
      if (signal?.aborted) throw new ClientFailure('INVALID_RESPONSE');
      await current(client);
      const value = await work(client);
      await current(client);
      if (ticket !== epoch.current || signal?.aborted) throw new ClientFailure('INVALID_RESPONSE');
      return value;
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        ['FORBIDDEN', 'ACCOUNT_SUSPENDED', 'SESSION_REVOKED'].includes(error.code)
      )
        cache.removeQueries({ queryKey: key });
      throw error;
    }
  }
  return { key, read };
}
export function OperationSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      id={'admin-' + title.toLowerCase().replaceAll(' ', '-')}
      aria-label={title}
      className="space-y-4 rounded-card border border-hsm-border bg-hsm-surface p-5"
    >
      <h3 className="text-xl font-semibold text-hsm-heading">{title}</h3>
      {children}
    </section>
  );
}
export function OperationState({
  pending,
  error,
  retry,
  empty,
}: {
  pending: boolean;
  error: unknown;
  retry: () => void;
  empty?: boolean;
}) {
  if (pending) return <p role="status">Loading current records…</p>;
  if (error)
    return (
      <div role="alert">
        <p>{errorMessage(error)}</p>
        <Button variant="secondary" onClick={retry}>
          Retry records
        </Button>
      </div>
    );
  return empty ? <p>No records match these filters.</p> : null;
}
export function OperationPages({
  hasMore,
  fetching,
  more,
  refresh,
}: {
  hasMore: boolean;
  fetching: boolean;
  more: () => void;
  refresh: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {hasMore ? (
        <Button variant="secondary" disabled={fetching} onClick={more}>
          Load more records
        </Button>
      ) : (
        <p>All matching pages loaded.</p>
      )}
      <Button variant="secondary" disabled={fetching} onClick={refresh}>
        Refresh records
      </Button>
    </div>
  );
}
export function OperationConfirmation({
  label,
  pending,
  disabled = false,
  confirm,
  cancel,
}: {
  label: string;
  pending: boolean;
  disabled?: boolean;
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Confirm administrative action"
      className="space-y-3 rounded-input border border-hsm-border bg-hsm-icy p-4"
    >
      <p>Confirm {label}. The current server permissions and version will be checked.</p>
      <Button disabled={pending || disabled} onClick={confirm}>
        Confirm {label}
      </Button>
      <Button variant="secondary" disabled={pending} onClick={cancel}>
        Cancel action
      </Button>
    </div>
  );
}
