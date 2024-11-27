import { useState } from 'react';
import { adminChangeInputSchema } from '@hsm/contracts';
import { changeAdmin } from '@hsm/api-client';
import type { z } from 'zod';
import { useAdminCommand } from './data';
import type { AdminRole } from './ui';
export type AdminAction = 'roles' | 'active' | 'suspended' | 'deactivated' | 'promote' | 'demote';
export function useAdminChange(target: string, savedRoles: AdminRole[]) {
  const [action, setAction] = useState<AdminAction>();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [reason, setReason] = useState('');
  const mutation = useAdminCommand(
    'Admin:change:' + target,
    (c, body: z.infer<typeof adminChangeInputSchema>, key) => changeAdmin(c, target, body, key),
    true,
  );
  function choose(next: AdminAction) {
    setAction(next);
    setReason('');
    setRoles(savedRoles);
    mutation.reset();
  }
  function submit() {
    if (!action) return;
    const body =
      action === 'roles'
        ? { change: 'roles', roles, reason }
        : action === 'promote' || action === 'demote'
          ? { change: 'root', isRoot: action === 'promote', reason }
          : { change: 'status', status: action, reason };
    const parsed = adminChangeInputSchema.safeParse(body);
    if (parsed.success)
      mutation.mutate(parsed.data, {
        onSuccess: () => {
          setAction(undefined);
          setReason('');
        },
      });
  }
  return {
    action,
    roles,
    reason,
    mutation,
    locked: mutation.isPending || mutation.unresolved,
    choose,
    setRoles,
    setReason,
    submit,
    cancel: () => setAction(undefined),
  };
}
