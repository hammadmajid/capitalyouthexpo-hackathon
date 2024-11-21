import { expect, it, vi } from 'vitest';
import { rooms } from '@hsm/db';
import { reportTypeSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { ReportService } from './reports.service.js';
vi.mock('../services/scope.js', () => ({
  lockStaffScope: vi.fn(async () => ({ actorRole: 'owner' })),
}));
const branch = '10000000-0000-4000-8000-000000000001';
const room = '20000000-0000-4000-8000-000000000001';
const actor = { userId: '30000000-0000-4000-8000-000000000001' } as Actor;
it.each(reportTypeSchema.options.filter((type) => type !== 'occupancy'))(
  'RPT-001 / AUD-010: %s accepts an authorized room predicate even with no matching facts',
  async (type) => {
    const store = queryFixture();
    store.enqueue(rooms, [{ id: room, branchId: branch, floorId: null }]);
    const service = new ReportService(store.database, () => new Date('2026-06-28T07:00:00Z'));
    const result = await service.branch(actor, branch, type, { roomId: room });
    expect(result.report.type).toBe(type);
    if (type !== 'rent-collection') expect(result.report.rows).toEqual([]);
  },
);
