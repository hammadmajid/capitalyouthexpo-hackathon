import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  managementPageSchema,
  organizationSummarySchema,
  branchSummarySchema,
  managerSummarySchema,
  managerSuspensionSchema,
} from './management.js';
it('SEC-001: lists have bounded pagination and reject unsupported filters', () => {
  expect(managementPageSchema.parse({})).toEqual({ limit: 20 });
  expect(managementPageSchema.parse({ limit: '100', cursor: randomUUID() }).limit).toBe(100);
  for (const input of [
    { limit: 101 },
    { limit: 0 },
    { limit: '1.5' },
    { cursor: 'sql' },
    { userId: randomUUID() },
  ])
    expect(managementPageSchema.safeParse(input).success).toBe(false);
});
it('MGR-004: suspension requires a bounded reason and rejects authority fields', () => {
  expect(managerSuspensionSchema.parse({ reason: '  Owner reason  ' })).toEqual({
    reason: 'Owner reason',
  });
  for (const input of [
    { reason: '' },
    { reason: ' ' },
    { reason: 'x'.repeat(501) },
    { reason: 'valid', owner: true },
  ])
    expect(managerSuspensionSchema.safeParse(input).success).toBe(false);
});
it('SEC-003: foundation DTOs cannot expose credentials or private resident information', () => {
  const id = randomUUID();
  const organization = { id, name: 'Organization' };
  const branch = {
    id,
    organizationId: randomUUID(),
    brandId: randomUUID(),
    name: 'Branch',
    verificationStatus: 'draft',
  };
  const manager = {
    id,
    userId: randomUUID(),
    branchId: randomUUID(),
    fullName: 'Manager',
    status: 'active',
  };
  expect(organizationSummarySchema.parse(organization)).toEqual(organization);
  expect(branchSummarySchema.parse(branch)).toEqual(branch);
  expect(managerSummarySchema.parse(manager)).toEqual(manager);
  expect(
    organizationSummarySchema.safeParse({ ...organization, ownerCnic: 'secret' }).success,
  ).toBe(false);
  expect(branchSummarySchema.safeParse({ ...branch, occupants: [] }).success).toBe(false);
  expect(managerSummarySchema.safeParse({ ...manager, tempPasswordHash: 'secret' }).success).toBe(
    false,
  );
});
