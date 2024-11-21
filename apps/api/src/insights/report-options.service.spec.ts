import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError, reportTypeSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockStaffScope } from '../services/scope.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { ReportService } from './reports.service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../services/scope.js', () => ({ lockStaffScope: vi.fn() }));
const branch = '10000000-0000-4000-8000-000000000001';
const actor = { userId: '20000000-0000-4000-8000-000000000001' } as Actor;
const clock = () => new Date('2026-06-28T07:00:00Z');
const financial = [
  'rent-collection',
  'outstanding-dues',
  'payment-history',
  'security-deposits',
  'checkout-history',
];
beforeEach(() => {
  vi.mocked(lockActor).mockReset();
  vi.mocked(lockStaffScope).mockReset();
});
it.each(reportTypeSchema.options)(
  'SEC-003 / RPT-001 / AUD-010: %s options use exactly the existing report grant and recheck the live actor',
  async (kind) => {
    const f = queryFixture(),
      service = new ReportService(f.database, clock);
    const result = await service.options(actor, branch, kind, { field: 'room' });
    expect(lockStaffScope).toHaveBeenCalledWith(
      f.transaction,
      actor,
      branch,
      [financial.includes(kind) ? 'finance_view' : 'stay_manage'],
      clock,
    );
    expect(lockActor).toHaveBeenCalledWith(f.transaction, actor, clock);
    expect(result).toEqual({
      branchId: branch,
      type: kind,
      field: 'room',
      buildingId: null,
      floorId: null,
      data: [],
      nextCursor: null,
    });
  },
);
it('SEC-003 / AUD-010: revoked report authority blocks every named data query', async () => {
  const f = queryFixture();
  vi.mocked(lockStaffScope).mockRejectedValueOnce(
    new DomainError('FORBIDDEN', 403, 'Grant unavailable'),
  );
  await expect(
    new ReportService(f.database, clock).options(actor, branch, 'payment-history', {
      field: 'resident',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.predicates).toEqual([]);
});
