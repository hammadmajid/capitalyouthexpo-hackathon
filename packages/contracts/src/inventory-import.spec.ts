import { expect, it } from 'vitest';
import {
  inventoryImportInputSchema,
  inventoryImportPageQuerySchema,
  inventoryImportRowSchema,
} from './inventory-import.js';
const id = '10000000-0000-4000-8000-000000000001';
it('PROP-001 / ACC-004: CSV boundary permits only current inventory kinds, not later resident/finance imports', () => {
  expect(inventoryImportInputSchema.parse({ kind: 'rooms', fileId: id })).toEqual({
    kind: 'rooms',
    fileId: id,
  });
  for (const kind of ['residents', 'opening_balances', 'payments'])
    expect(inventoryImportInputSchema.safeParse({ kind, fileId: id }).success).toBe(false);
  expect(
    inventoryImportInputSchema.safeParse({ kind: 'rooms', fileId: id, branchId: id }).success,
  ).toBe(false);
});
it('PROP-001: row preview and pagination bounds cannot contain extra fields or exceed limits', () => {
  expect(inventoryImportPageQuerySchema.parse({})).toEqual({ offset: 0, limit: 50 });
  expect(inventoryImportPageQuerySchema.safeParse({ offset: 501 }).success).toBe(false);
  expect(inventoryImportPageQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  expect(
    inventoryImportRowSchema.safeParse({
      recordNumber: 2,
      roomTypeId: id,
      roomNumber: '201',
      bedLabel: null,
      errors: [],
      occupant: 'PRIVATE',
    }).success,
  ).toBe(false);
});
