import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { CustomerGovernanceService } from './customer-governance.service.js';
import { IdempotencyService } from '../idempotency/service.js';
import { IdempotencyRepository } from '../idempotency/repository.js';
const mocks = vi.hoisted(() => ({ lock: vi.fn() }));
vi.mock('./scope.js', () => ({ lockAdmin: mocks.lock, platformAudit: vi.fn() }));
const actor = {
  userId: '10000000-0000-4000-8000-000000000001',
  sessionId: '10000000-0000-4000-8000-000000000002',
};
beforeEach(() => {
  vi.clearAllMocks();
});
it('HMA-015 SEC-003: denied customer reader never executes a data query', async () => {
  const fixture = queryFixture();
  mocks.lock.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Denied'));
  const service = new CustomerGovernanceService(
    fixture.database,
    new IdempotencyService(new IdempotencyRepository(fixture.database)),
  );
  await expect(service.list(actor, {})).rejects.toMatchObject({ status: 403 });
  expect(fixture.operations).toEqual([]);
});
it('HMA-015: self enforcement is rejected before a transaction or session mutation', () => {
  const fixture = queryFixture();
  const service = new CustomerGovernanceService(
    fixture.database,
    new IdempotencyService(new IdempotencyRepository(fixture.database)),
  );
  expect(() =>
    service.decide(actor, actor.sessionId, actor.userId, {
      action: 'ban',
      reason: 'Confirmed abusive platform behavior',
      expectedStatus: 'active',
      expectedUpdatedAt: new Date().toISOString(),
    }),
  ).toThrow(DomainError);
  expect(fixture.operations).toEqual([]);
});
