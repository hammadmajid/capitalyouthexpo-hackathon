import type { QueryClient } from '@tanstack/react-query';
// AUD-009: one decision affects the branch queue and both scoped dashboard views.
export async function refreshDashboardCounts(
  cache: QueryClient,
  actorId: string,
  branchId: string,
) {
  await Promise.all([
    cache.invalidateQueries({ queryKey: ['owner-dashboard', actorId] }),
    cache.invalidateQueries({ queryKey: ['branch-dashboard', actorId, branchId] }),
    cache.invalidateQueries({ queryKey: ['dashboard-queue', actorId, branchId] }),
  ]);
}
export async function refreshBookingViews(cache: QueryClient, actorId: string, branchId: string) {
  await Promise.all([
    cache.invalidateQueries({ queryKey: ['hostel-bookings', actorId, branchId] }),
    refreshDashboardCounts(cache, actorId, branchId),
  ]);
}
