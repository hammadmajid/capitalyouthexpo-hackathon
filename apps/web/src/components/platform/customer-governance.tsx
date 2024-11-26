'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { decideCustomer, listGovernedCustomers } from '@hsm/api-client';
import { customerGovernanceInputSchema, type customerGovernanceRecordSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import { errorMessage } from '../../lib/messages';
import {
  OperationConfirmation,
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
type Customer = z.infer<typeof customerGovernanceRecordSchema>;
export function CustomerGovernance({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'customer-governance', 'content_moderator');
  const [status, setStatus] = useState('active');
  const list = useInfiniteQuery({
    queryKey: [...scope.key, status],
    initialPageParam: undefined as string | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) => listGovernedCustomers(c, { status, ...(pageParam ? { cursor: pageParam } : {}) }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows =
    list.isError || (list.isFetching && !list.isFetchingNextPage)
      ? []
      : (list.data?.pages.flatMap((p) => p.data) ?? []);
  return (
    <OperationSection title="Customer account governance">
      <p>
        Reasoned policy enforcement. Admin, Owner and active Manager identities are protected.
        Suspensions and bans revoke sessions.
      </p>
      <label className="field-label">
        Customer status
        <select
          aria-label="Customer status"
          className="field-input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {['active', 'suspended', 'banned'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <OperationState
        pending={list.isPending || list.isFetching}
        error={list.error}
        empty={!rows.length}
        retry={() => {
          void list.refetch();
        }}
      />
      {rows.map((row) => (
        <Decision key={row.userId + row.updatedAt} actorId={actorId} row={row} />
      ))}
      <OperationPages
        hasMore={Boolean(list.hasNextPage)}
        fetching={list.isFetching}
        more={() => {
          void list.fetchNextPage();
        }}
        refresh={() => {
          void list.refetch();
        }}
      />
    </OperationSection>
  );
}
function Decision({ actorId, row }: { actorId: string; row: Customer }) {
  const scope = useOperationScope(actorId, 'customer-governance', 'content_moderator');
  const [reason, setReason] = useState(''),
    [action, setAction] = useState<string>();
  const command = useCommand(
    'customer-governance:' + row.userId,
    (input: z.infer<typeof customerGovernanceInputSchema>, key) =>
      scope.read((c) => decideCustomer(c, row.userId, input, key)),
    [scope.key],
  );
  const locked = command.isPending || command.unresolved;
  return (
    <article className="space-y-3">
      <h4>{row.fullName}</h4>
      <p>
        {row.userId} · {row.status}
      </p>
      <CommandRecovery command={command} />
      {command.error ? (
        <p role="alert">
          {errorMessage(command.error)} Refresh the list before retrying a conflict.
        </p>
      ) : null}
      {command.isSuccess ? <p role="status">Decision recorded.</p> : null}
      <label className="field-label">
        Decision reason
        <textarea
          aria-label={'Decision reason for ' + row.fullName}
          className="field-input"
          maxLength={500}
          value={reason}
          disabled={locked || Boolean(action)}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {action ? (
        <>
          <p>
            Confirm {action}: {reason}. Reinstatement requires a fresh login.
          </p>
          <OperationConfirmation
            label="customer decision"
            pending={locked}
            confirm={() =>
              command.mutate(
                customerGovernanceInputSchema.parse({
                  action,
                  reason,
                  expectedStatus: row.status,
                  expectedUpdatedAt: row.updatedAt,
                }),
                { onSuccess: () => setAction(undefined) },
              )
            }
            cancel={() => setAction(undefined)}
          />
        </>
      ) : (
        (row.status === 'active'
          ? ['warn', 'suspend', 'ban']
          : row.status === 'suspended'
            ? ['ban', 'reinstate']
            : ['reinstate']
        ).map((value) => (
          <Button
            key={value}
            variant="secondary"
            disabled={locked || reason.trim().length < 8}
            onClick={() => setAction(value)}
          >
            {value} customer
          </Button>
        ))
      )}
    </article>
  );
}
