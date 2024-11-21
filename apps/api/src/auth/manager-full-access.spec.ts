import { expect, it, vi } from 'vitest';
import { hostelAuditLog, managerInventoryGrants } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { FULL_BRANCH_PERMISSIONS, grantFullBranchAccess } from './manager-full-access.js';
function fake(branch: unknown[]) {
  const inserts: { table: unknown; values: unknown }[] = [];
  const onConflictDoNothing = vi.fn();
  const select = {
    from: () => select,
    where: () => select,
    limit: async () => branch,
  };
  const transaction = {
    select: () => select,
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return Object.assign(Promise.resolve(), { onConflictDoNothing });
      },
    }),
  };
  return { transaction: transaction as unknown as Transaction, inserts, onConflictDoNothing };
}
const input = {
  assignmentId: 'assignment',
  branchId: 'branch',
  managerUserId: 'manager',
  now: new Date('2026-11-14T00:00:00Z'),
};
it('CHG-029 / ACC-006: activation grants every branch permission and audits it together', async () => {
  const f = fake([{ organizationId: 'org' }]);
  await grantFullBranchAccess(f.transaction, input);
  const grants = f.inserts.find((row) => row.table === managerInventoryGrants);
  expect(grants?.values).toEqual(
    FULL_BRANCH_PERMISSIONS.map((permission) => ({
      assignmentId: 'assignment',
      permission,
      grantedAt: input.now,
    })),
  );
  expect(FULL_BRANCH_PERMISSIONS).toContain('payment_record');
  expect(f.onConflictDoNothing).toHaveBeenCalled();
  const audit = f.inserts.find((row) => row.table === hostelAuditLog);
  expect(audit?.values).toMatchObject({
    action: 'manager.inventory_permissions.granted',
    organizationId: 'org',
    branchId: 'branch',
    targetId: 'assignment',
    after: { permissions: [...FULL_BRANCH_PERMISSIONS] },
  });
});
it('ACC-006: a missing branch fails the activation instead of granting silently', async () => {
  const f = fake([]);
  await expect(grantFullBranchAccess(f.transaction, input)).rejects.toMatchObject({
    code: 'INTERNAL',
  });
  expect(f.inserts).toHaveLength(0);
});
