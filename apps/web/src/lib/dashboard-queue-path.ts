import { z } from 'zod';
export const dashboardNavigationQueueSchema = z.enum([
  'bookings',
  'proofs',
  'overdue',
  'complaints',
  'checkouts',
]);
export type DashboardNavigationQueue = z.infer<typeof dashboardNavigationQueueSchema>;
export const dashboardContextSchema = z.enum(['owner', 'manager']);
export type DashboardContext = z.infer<typeof dashboardContextSchema>;
export function dashboardQueuePath(
  context: DashboardContext,
  queue: DashboardNavigationQueue,
  branchId?: string,
) {
  return (
    '/app/' +
    dashboardContextSchema.parse(context) +
    '/queues/' +
    dashboardNavigationQueueSchema.parse(queue) +
    (branchId ? '/' + z.string().uuid().parse(branchId).toLowerCase() : '')
  );
}
export function parseDashboardQueuePath(input: unknown) {
  if (typeof input !== 'string') return undefined;
  const match =
    /^\/app\/(owner|manager)\/queues\/(bookings|proofs|overdue|complaints|checkouts)(?:\/([0-9a-f-]{36}))?$/.exec(
      input,
    );
  if (!match || (match[3] !== undefined && !z.string().uuid().safeParse(match[3]).success))
    return undefined;
  return {
    context: dashboardContextSchema.parse(match[1]),
    queue: dashboardNavigationQueueSchema.parse(match[2]),
    ...(match[3] ? { branchId: match[3] } : {}),
  };
}
