import { describe, expect, it } from 'vitest';
import { occupancyBedSchema, occupancyQuerySchema, occupancyTotalsSchema } from './occupancy.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bed = { id, label: 'A', ordinal: 1, status: 'active', state: 'available', occupant: null };
describe('occupancy contracts', () => {
  it('BED-001: query bounds paging and validates the date', () => {
    expect(occupancyQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(occupancyQuerySchema.parse({ on: '2026-10-26', limit: '50' })).toEqual({
      on: '2026-10-26',
      limit: 50,
    });
    expect(occupancyQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(occupancyQuerySchema.safeParse({ on: '2026-13-01' }).success).toBe(false);
    expect(occupancyQuerySchema.safeParse({ extra: 1 }).success).toBe(false);
  });
  it('RES-004: only an occupied bed carries an occupant', () => {
    expect(occupancyBedSchema.parse(bed).state).toBe('available');
    expect(
      occupancyBedSchema.safeParse({ ...bed, occupant: { stayId: id, displayName: 'R' } }).success,
    ).toBe(false);
    expect(occupancyBedSchema.safeParse({ ...bed, state: 'occupied' }).success).toBe(false);
    expect(
      occupancyBedSchema.parse({
        ...bed,
        state: 'occupied',
        occupant: { stayId: id.toUpperCase(), displayName: 'R' },
      }).occupant?.stayId,
    ).toBe(id);
  });
  it('BED-001: totals must add up to the bed count', () => {
    const totals = { beds: 2, occupied: 1, blocked: 0, reserved: 1, unavailable: 0, available: 0 };
    expect(occupancyTotalsSchema.parse(totals)).toEqual(totals);
    expect(occupancyTotalsSchema.safeParse({ ...totals, beds: 3 }).success).toBe(false);
  });
});
