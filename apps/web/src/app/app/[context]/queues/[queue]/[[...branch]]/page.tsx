import { z } from 'zod';
import { notFound } from 'next/navigation';
import { Shell } from '../../../../../../components/shell';
import { DashboardQueueScreen } from '../../../../../../components/platform/dashboard-queue-screen';
import {
  dashboardContextSchema,
  dashboardNavigationQueueSchema,
} from '../../../../../../lib/dashboard-queue-path';
const route = z
  .object({
    context: dashboardContextSchema,
    queue: dashboardNavigationQueueSchema,
    branch: z.array(z.string().uuid()).max(1).optional(),
  })
  .strict();
export default async function QueuePage({
  params,
}: {
  params: Promise<{ context: string; queue: string; branch?: string[] }>;
}) {
  const value = route.safeParse(await params);
  if (!value.success) notFound();
  const { context, queue, branch } = value.data;
  return (
    <Shell context={context}>
      <DashboardQueueScreen
        context={context}
        queue={queue}
        {...(branch?.[0] ? { branchId: branch[0].toLowerCase() } : {})}
      />
    </Shell>
  );
}
