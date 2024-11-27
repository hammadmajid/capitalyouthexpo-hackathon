import type { QueryKey } from '@tanstack/react-query';
// Shared invalidation boundary for admissions, occupancy/lifecycle and approved payments.
export function stayWorkspaceKeys(actorId: string, branchId: string): QueryKey[] {
  return [
    'bed-board',
    'bed-detail',
    'bed-history',
    'private-stays',
    'resident-directory',
    'branch-dashboard',
    'rent-board',
    'private-invoices',
    'stay-record',
    'stay-settlement',
    'staff-stay-payment-summary',
    'staff-stay-agreed-rent',
    'payment-proof-queue',
    'approved-stay-proofs',
  ]
    .map((key) => [key, actorId, branchId])
    .concat([['owner-dashboard', actorId]]);
}
