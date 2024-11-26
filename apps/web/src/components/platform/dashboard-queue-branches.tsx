'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { branchSummarySchema, inventoryPageSequenceIsValid } from '@hsm/contracts';
import { ClientFailure, readApi, readInventoryAccess } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import {
  dashboardQueuePath,
  type DashboardContext,
  type DashboardNavigationQueue,
} from '../../lib/dashboard-queue-path';
import { queuePermission } from './dashboard-queue-config';
import { Button } from '../ui/button';
type Props = { actorId: string; context: DashboardContext; queue: DashboardNavigationQueue };
const schema = z
  .object({ data: z.array(branchSummarySchema).max(20), nextCursor: z.string().uuid().nullable() })
  .strict();
export function DashboardQueueBranches(props: Props) {
  return <BranchPages key={props.actorId + ':' + props.context + ':' + props.queue} {...props} />;
}
function BranchPages(props: Props) {
  const [cursor, setCursor] = useState<string>();
  const branches = useQuery({
    queryKey: ['dashboard-queue-branches', props.actorId, props.context, cursor],
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const page = await readApi(
        browserClient().GET(
          props.context === 'owner' ? '/v1/owner/branches' : '/v1/manage/branches',
          { params: { query: { limit: 20, ...(cursor ? { cursor } : {}) } } },
        ),
        schema,
      );
      if (
        !inventoryPageSequenceIsValid(page.data, cursor) ||
        (page.nextCursor !== null &&
          (page.data.length !== 20 || page.nextCursor !== page.data.at(-1)?.id))
      )
        throw new ClientFailure('INVALID_RESPONSE');
      return page;
    },
  });
  if (branches.error)
    return (
      <div>
        <p role="alert">{errorMessage(branches.error)}</p>
        <Button onClick={() => void branches.refetch()}>Retry queue branches</Button>
      </div>
    );
  if (!branches.data || branches.isFetching) return <p role="status">Loading queue branches…</p>;
  return (
    <section aria-label="Queue branches" className="space-y-3">
      <p>Choose a branch. This list includes every authorized branch through paging.</p>
      {!branches.data.data.length ? <p>No branches are available.</p> : null}
      {branches.data.data.map((row) => (
        <BranchLink key={row.id} {...props} branchId={row.id} name={row.name} />
      ))}
      {branches.data.nextCursor ? (
        <Button onClick={() => setCursor(branches.data.nextCursor ?? undefined)}>
          Next queue branches
        </Button>
      ) : null}
      {cursor ? (
        <Button variant="secondary" onClick={() => setCursor(undefined)}>
          First queue branches
        </Button>
      ) : null}
    </section>
  );
}
function BranchLink(props: Props & { branchId: string; name: string }) {
  const access = useQuery({
    queryKey: ['inventory-access', props.actorId, props.branchId],
    queryFn: () => readInventoryAccess(browserClient(), props.branchId),
    gcTime: 0,
    retry: false,
  });
  if (
    !access.data ||
    access.error ||
    access.isFetching ||
    !access.data.permissions.includes(queuePermission(props.queue))
  )
    return <p>Queue access unavailable.</p>;
  return (
    <Link
      className="text-link block"
      href={dashboardQueuePath(props.context, props.queue, props.branchId)}
    >
      {props.name}
    </Link>
  );
}
