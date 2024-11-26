'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { readInventoryAccess } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import {
  dashboardQueuePath,
  type DashboardContext,
  type DashboardNavigationQueue,
} from '../../lib/dashboard-queue-path';
import { queuePermission } from './dashboard-queue-config';
export function DashboardQueueLink({
  actorId,
  context,
  queue,
  branchId,
  children,
}: {
  actorId: string;
  context: DashboardContext;
  queue: DashboardNavigationQueue;
  branchId?: string;
  children: ReactNode;
}) {
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    enabled: branchId !== undefined,
    gcTime: 0,
    retry: false,
    queryFn: () => readInventoryAccess(browserClient(), branchId ?? ''),
  });
  if (
    branchId &&
    (!access.data ||
      access.error ||
      access.isFetching ||
      !access.data.permissions.includes(queuePermission(queue)))
  )
    return <span>{children}</span>;
  return (
    <Link className="text-link" href={dashboardQueuePath(context, queue, branchId)}>
      {children}
    </Link>
  );
}
