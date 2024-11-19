import { describe, expect, it } from 'vitest';
import { bedHistoryQuerySchema, bedOccupancyHistoryPageSchema } from './bed-occupancy-history.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('BED-002 historical assignments', () => {
  it('validates bounded chronological continuation without accepting foreign query fields', () => {
    expect(bedHistoryQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(
      bedHistoryQuerySchema.safeParse({ cursor: '2026-11-01T10:00:00.000Z|' + id }).success,
    ).toBe(true);
    for (const input of [
      { limit: 51 },
      { cursor: 'bad|' + id },
      { cursor: '2026-11-01T10:00:00Z|bad' },
      { branchId: id },
    ])
      expect(bedHistoryQuerySchema.safeParse(input).success).toBe(false);
  });
  it('permits empty history, rejects private extras, reversed dates and duplicate assignments', () => {
    const page = { branchId: id, bedId: id, data: [], nextCursor: null };
    expect(bedOccupancyHistoryPageSchema.parse(page)).toEqual(page);
    expect(
      bedOccupancyHistoryPageSchema.safeParse({ ...page, password: 'unexpected' }).success,
    ).toBe(false);
    const row = {
      assignmentId: id,
      stayId: id,
      residentName: 'Resident',
      startedAt: '2026-11-01T10:00:00Z',
      endedAt: null,
      wholeRoom: false,
    };
    expect(bedOccupancyHistoryPageSchema.safeParse({ ...page, data: [row, row] }).success).toBe(
      false,
    );
    expect(
      bedOccupancyHistoryPageSchema.safeParse({
        ...page,
        data: [{ ...row, endedAt: '2026-10-01T10:00:00Z' }],
      }).success,
    ).toBe(false);
  });
});
