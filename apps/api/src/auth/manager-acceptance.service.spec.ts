import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { ManagerAcceptanceService } from './manager-acceptance.service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const profile = {
  user: {
    id: actor.userId,
    fullName: 'Existing user',
    email: 'verified@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: {
    customer: true,
    owner: true,
    managerOf: [{ branchId: randomUUID(), branchName: 'Assigned branch' }],
    admin: null,
  },
};
const repository = { accept: vi.fn() },
  profiles = { read: vi.fn() };
const service = new ManagerAcceptanceService(repository, profiles);
beforeEach(() => {
  vi.resetAllMocks();
  profiles.read.mockResolvedValue(profile);
});
it('AUTH-M CHG-006: returns fresh additive capabilities only after committed acceptance', async () => {
  expect(await service.accept(actor)).toEqual(profile);
  expect(repository.accept).toHaveBeenCalledWith(actor);
  expect(profiles.read).toHaveBeenCalledWith(actor.userId);
  expect(repository.accept.mock.invocationCallOrder[0]).toBeLessThan(
    profiles.read.mock.invocationCallOrder[0] ?? 0,
  );
});
it('SEC: failed or revoked invitation cannot return a capability projection', async () => {
  repository.accept.mockRejectedValueOnce(new Error('Transaction unavailable'));
  await expect(service.accept(actor)).rejects.toThrow('Transaction unavailable');
  expect(profiles.read).not.toHaveBeenCalled();
});
