// Shared resident-services text; kept separate so resident.tsx and resident-complaints.tsx
// do not import each other (avoids a require cycle).
export const field =
  'min-h-12 rounded-input border border-border bg-surface px-4 py-3 font-body text-body text-text';
export const statusText: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved — please confirm',
  reopened: 'Reopened',
  closed: 'Closed',
  requested: 'Requested',
  active: 'Active',
  ended: 'Ended',
  rejected: 'Not approved',
  withdrawn: 'Withdrawn',
};
