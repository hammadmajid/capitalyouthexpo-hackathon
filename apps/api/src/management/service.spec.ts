import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { ManagementService } from './service.js';
import type { ManagementReadRepository } from './read.repository.js';
import type { StaffRepository } from './staff.repository.js';
import { hashPassword } from '../auth/crypto.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const reads = {
  cities: vi.fn(),
  areas: vi.fn(),
  organizations: vi.fn(),
  branches: vi.fn(),
  branch: vi.fn(),
  managers: vi.fn(),
  passwordHash: vi.fn(),
};
const staff = { transition: vi.fn() };
const service = new ManagementService(
  reads as unknown as ManagementReadRepository,
  staff as unknown as StaffRepository,
);
const organization = { id: randomUUID(), name: 'Organization' };
const branch = {
  id: randomUUID(),
  organizationId: randomUUID(),
  brandId: randomUUID(),
  name: 'Branch',
  verificationStatus: 'draft',
};
const manager = {
  id: randomUUID(),
  userId: randomUUID(),
  branchId: branch.id,
  fullName: 'Manager',
  status: 'active',
};
beforeEach(() => vi.resetAllMocks());
it('BRN-001: paginated organization DTO has a continuation only with another row', async () => {
  reads.organizations.mockResolvedValue([organization, { ...organization, id: randomUUID() }]);
  expect(await service.organizations(actor, { limit: 1 })).toEqual({
    data: [organization],
    nextCursor: organization.id,
  });
  reads.organizations.mockResolvedValue([]);
  expect(await service.organizations(actor, { limit: 1 })).toEqual({ data: [], nextCursor: null });
});
it('BRN-002: owner and authorized branch listings preserve the repository scope selection', async () => {
  reads.branches.mockResolvedValue([branch]);
  expect(await service.branches(actor, { limit: 20 }, true)).toEqual({
    data: [branch],
    nextCursor: null,
  });
  expect(reads.branches).toHaveBeenCalledWith(actor, { limit: 20 }, true);
  await service.branches(actor, { limit: 20 }, false);
  expect(reads.branches).toHaveBeenLastCalledWith(actor, { limit: 20 }, false);
});
it('SEC-003: branch lookup rejects unexpected private fields', async () => {
  reads.branch.mockResolvedValue(branch);
  expect(await service.branch(actor, branch.id)).toEqual(branch);
  reads.branch.mockResolvedValue({ ...branch, occupants: [] });
  await expect(service.branch(actor, branch.id)).rejects.toThrow();
});
it('MGR-001: assignment history is strictly projected and paginated', async () => {
  reads.managers.mockResolvedValue([manager]);
  expect(await service.managers(actor, branch.id, { limit: 20 })).toEqual({
    data: [manager],
    nextCursor: null,
  });
  reads.managers.mockResolvedValue([{ ...manager, passwordHash: 'unexpected' }]);
  await expect(service.managers(actor, branch.id, { limit: 20 })).rejects.toThrow();
});
it('MGR-004: transitions delegate trusted actor, scope and bounded reason', async () => {
  staff.transition.mockResolvedValue({ id: manager.id, branchId: branch.id, status: 'suspended' });
  expect(await service.transition(actor, branch.id, manager.id, 'suspend', 'Reason')).toMatchObject(
    { status: 'suspended' },
  );
  expect(staff.transition).toHaveBeenCalledWith(actor, branch.id, manager.id, 'suspend', 'Reason');
  await service.transition(actor, branch.id, manager.id, 'deactivate');
  expect(staff.transition).toHaveBeenLastCalledWith(
    actor,
    branch.id,
    manager.id,
    'deactivate',
    null,
  );
});

it('ONB-001: reference lists project strict labels and page without private fields', async () => {
  reads.cities.mockResolvedValue([organization, { ...organization, id: randomUUID() }]);
  expect(await service.cities(actor, { limit: 1 })).toEqual({
    data: [organization],
    nextCursor: organization.id,
  });
  const area = { ...organization, cityId: branch.id, parentId: null, level: 'area' };
  reads.areas.mockResolvedValue([area]);
  expect(await service.areas(actor, branch.id, { limit: 20 })).toEqual({
    data: [area],
    nextCursor: null,
  });
  expect(reads.areas).toHaveBeenCalledWith(actor, branch.id, { limit: 20 });
  reads.cities.mockResolvedValue([{ ...organization, ownerId: actor.userId }]);
  await expect(service.cities(actor, { limit: 20 })).rejects.toThrow();
  reads.areas.mockResolvedValue([{ ...area, secret: true }]);
  await expect(service.areas(actor, branch.id, { limit: 20 })).rejects.toThrow();
});

it("AUTH-M-006: removing a Manager needs the Owner's own correct password", async () => {
  reads.passwordHash.mockResolvedValue(await hashPassword('Owner password 1'));
  staff.transition.mockResolvedValue({
    id: manager.id,
    branchId: branch.id,
    status: 'deactivated',
  });
  await expect(
    service.remove(actor, branch.id, manager.id, 'Wrong password 1'),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
  expect(staff.transition).not.toHaveBeenCalled();
  expect(await service.remove(actor, branch.id, manager.id, 'Owner password 1')).toMatchObject({
    status: 'deactivated',
  });
  expect(reads.passwordHash).toHaveBeenCalledWith(actor.userId);
  expect(staff.transition).toHaveBeenCalledWith(actor, branch.id, manager.id, 'deactivate', null);
});
it('AUTH-M-006: an account without a password can never remove a Manager', async () => {
  reads.passwordHash.mockResolvedValue(null);
  await expect(service.remove(actor, branch.id, manager.id, 'anything')).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
  });
  expect(staff.transition).not.toHaveBeenCalled();
});
