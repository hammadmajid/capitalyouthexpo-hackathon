import { DomainError, type ManagerAction } from '@hsm/contracts';
type Status = 'pending_activation' | 'active' | 'suspended' | 'deactivated';
const transitions: Record<ManagerAction, Partial<Record<Status, Status>>> = {
  suspend: { active: 'suspended', suspended: 'suspended' },
  reinstate: { active: 'active', suspended: 'active' },
  deactivate: {
    pending_activation: 'deactivated',
    active: 'deactivated',
    suspended: 'deactivated',
    deactivated: 'deactivated',
  },
};
// MGR-004/005: suspension retains the assignment; deactivation is irreversible.
export function managerTransition(status: Status, action: ManagerAction): Status {
  const next = transitions[action][status];
  if (!next) throw new DomainError('CONFLICT', 409, 'Manager transition unavailable');
  return next;
}
