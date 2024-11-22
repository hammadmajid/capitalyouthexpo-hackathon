import { expect, it } from 'vitest';
import type { ManagerAction } from '@hsm/contracts';
import { managerTransition } from './policy.js';
const statuses = ['pending_activation', 'active', 'suspended', 'deactivated'] as const;
const actions: ManagerAction[] = ['suspend', 'reinstate', 'deactivate'];
for (const status of statuses)
  for (const action of actions) {
    it('MGR-004/005: ' + status + ' → ' + action, () => {
      const expected =
        action === 'deactivate'
          ? 'deactivated'
          : action === 'suspend' && (status === 'active' || status === 'suspended')
            ? 'suspended'
            : action === 'reinstate' && (status === 'active' || status === 'suspended')
              ? 'active'
              : undefined;
      if (expected) expect(managerTransition(status, action)).toBe(expected);
      else
        expect(() => managerTransition(status, action)).toThrow(
          expect.objectContaining({ code: 'CONFLICT' }),
        );
    });
  }
