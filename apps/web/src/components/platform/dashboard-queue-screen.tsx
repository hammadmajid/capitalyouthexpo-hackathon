'use client';
import Link from 'next/link';
import { useSession } from '../providers';
import { canEnter } from '../../lib/capabilities';
import {
  dashboardQueuePath,
  type DashboardContext,
  type DashboardNavigationQueue,
} from '../../lib/dashboard-queue-path';
import { DashboardQueueBranches } from './dashboard-queue-branches';
import { DashboardQueueScope } from './dashboard-queue-scope';
import { queueLabels } from './dashboard-queue-config';
export function DashboardQueueScreen({
  context,
  queue,
  branchId,
}: {
  context: DashboardContext;
  queue: DashboardNavigationQueue;
  branchId?: string;
}) {
  const session = useSession();
  if (session.isPending) return <p role="status">Restoring queue session…</p>;
  if (session.error || !session.data || !canEnter(session.data, context))
    return <p role="alert">This queue space is unavailable.</p>;
  return (
    <section aria-label="Dashboard queue" className="space-y-4">
      <h1 className="text-2xl font-semibold">{queueLabels[queue]}</h1>
      <Link className="text-link" href={'/app/' + context}>
        Back to dashboard
      </Link>
      {branchId ? (
        <>
          <Link className="text-link block" href={dashboardQueuePath(context, queue)}>
            Choose another queue branch
          </Link>
          <DashboardQueueScope actorId={session.data.user.id} branchId={branchId} queue={queue} />
        </>
      ) : (
        <DashboardQueueBranches actorId={session.data.user.id} context={context} queue={queue} />
      )}
    </section>
  );
}
