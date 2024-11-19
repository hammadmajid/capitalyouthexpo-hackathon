import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { managerInventoryGrantStateSchema, inventoryPermissionSchema } from './inventory.js';
const state = { branchId: randomUUID(), assignmentId: randomUUID(), permissions: [] };
it('ACC-004: saved permission state accepts every explicit approved grant and normalizes identifiers', () => {
  expect(
    managerInventoryGrantStateSchema.parse({
      ...state,
      branchId: state.branchId.toUpperCase(),
      permissions: inventoryPermissionSchema.options,
    }),
  ).toEqual({ ...state, permissions: inventoryPermissionSchema.options });
});
it.each([
  { ...state, permissions: ['listing_edit', 'listing_edit'] },
  { ...state, permissions: ['private_document_download'] },
  { ...state, permissions: Array(9).fill('listing_edit') },
  { ...state, ownerUserId: randomUUID() },
  { ...state, assignmentId: 'invalid' },
])('ACC-004 / CHG-008: invalid or private permission projection is rejected %#', (input) => {
  expect(managerInventoryGrantStateSchema.safeParse(input).success).toBe(false);
});

it.each(['stay_manage', 'rent_manage', 'payment_record', 'finance_view', 'checkout_manage'])(
  'ACC-004 / CHG-010: operational grant %s is explicit, never inferred from legacy inventory access',
  (permission) => {
    expect(
      managerInventoryGrantStateSchema.parse({ ...state, permissions: [permission] }).permissions,
    ).toEqual([permission]);
    expect(
      managerInventoryGrantStateSchema.parse({ ...state, permissions: ['booking_manage'] })
        .permissions,
    ).toEqual(['booking_manage']);
    expect(managerInventoryGrantStateSchema.parse(state).permissions).toEqual([]);
  },
);
it('ACC-004 / CHG-010: operational expansion does not create private-document or cross-branch override grants', () => {
  for (const permission of ['private_document_download', 'all_finance', 'all_branches'])
    expect(inventoryPermissionSchema.safeParse(permission).success).toBe(false);
});
