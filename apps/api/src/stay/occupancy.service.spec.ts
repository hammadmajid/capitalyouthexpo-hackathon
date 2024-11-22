import { describe, expect, it, vi } from 'vitest';
import { OccupancyService } from './occupancy.service.js';
import type { OccupancyRepository } from './occupancy.repository.js';
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor = { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } as never;
const totals = { beds: 0, occupied: 0, blocked: 0, reserved: 0, unavailable: 0, available: 0 };
function service(result: unknown) {
  const page = vi.fn().mockResolvedValue(result),
    bed = vi.fn().mockResolvedValue(result);
  return {
    page,
    bed,
    service: new OccupancyService({ page, bed } as unknown as OccupancyRepository),
  };
}
describe('OccupancyService', () => {
  it('BED-001: validates the branch and query before reading', async () => {
    const { page, service: subject } = service({
      branchId,
      on: '2026-10-26',
      totals,
      data: [],
      nextCursor: null,
    });
    await expect(
      subject.page(actor, branchId.toUpperCase(), { limit: '5' }),
    ).resolves.toMatchObject({ on: '2026-10-26' });
    expect(page).toHaveBeenCalledWith(actor, branchId, { limit: 5 });
    await expect(subject.page(actor, 'nope', {})).rejects.toThrow();
    await expect(subject.page(actor, branchId, { limit: 51 })).rejects.toThrow();
    await expect(subject.page(actor, branchId, { on: '2026-02-30' })).rejects.toThrow();
  });
  it('RES-004: an inconsistent projection is an internal error, never returned', async () => {
    const { service: subject } = service({
      branchId,
      on: '2026-10-26',
      totals: { ...totals, beds: 1 },
      data: [],
      nextCursor: null,
    });
    await expect(subject.page(actor, branchId, {})).rejects.toMatchObject({ status: 500 });
  });
});
it('BED-002: bed detail validates input and rejects inconsistent projections', async () => {
  const { bed, service: subject } = service({ bad: true });
  await expect(subject.bed(actor, branchId, branchId, { on: '2026-10-26' })).rejects.toMatchObject({
    status: 500,
  });
  expect(bed).toHaveBeenCalledWith(actor, branchId, branchId, '2026-10-26');
  await expect(subject.bed(actor, branchId, 'bad', {})).rejects.toThrow();
  await expect(subject.bed(actor, branchId, branchId, { x: 1 })).rejects.toThrow();
});
