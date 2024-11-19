import { expect, it } from 'vitest';
import { adminExplorerQuerySchema, adminExplorerRecordSchema } from './admin-explorer.js';
it('HMA-017 SEC-003: directory boundaries reject unbounded pages and private-field injection', () => {
  expect(adminExplorerQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  expect(adminExplorerQuerySchema.safeParse({ sort: 'unsafe SQL' }).success).toBe(false);
  expect(adminExplorerQuerySchema.safeParse({ cursor: 'a'.repeat(2001) }).success).toBe(false);
  const record = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Account',
    status: 'active',
    createdAt: '2026-10-31T00:00:00Z',
    parentId: null,
    parentName: null,
    quantity: null,
    amountPaisa: null,
    reason: null,
  };
  expect(adminExplorerRecordSchema.safeParse(record).success).toBe(true);
  for (const key of ['email', 'passwordHash', 'cnic', 'residentName', 'proofUrl'])
    expect(adminExplorerRecordSchema.safeParse({ ...record, [key]: 'private' }).success).toBe(
      false,
    );
  expect(adminExplorerRecordSchema.safeParse({ ...record, amountPaisa: '10.50' }).success).toBe(
    false,
  );
});
