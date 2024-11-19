import { expect, it } from 'vitest';
import {
  inventoryIsAvailable,
  inventoryTargetSchema,
  inventoryTargetsOverlap,
  stayRangeSchema,
  stayRangesOverlap,
} from './booking-availability.js';
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bed = { kind: 'bed', roomId, bedId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const room = { kind: 'room', roomId };
const range = { moveInDate: '2026-11-01', moveOutDate: '2026-12-01' };
const now = new Date('2026-10-14T00:00:00Z');
const claim = { target: bed, range, state: 'confirmed', expiresAt: null, reservesInventory: true };
it('ACC-001: half-open date boundaries and different rooms/beds do not conflict', () => {
  expect(stayRangesOverlap(range, range)).toBe(true);
  expect(stayRangesOverlap(range, { moveInDate: '2026-12-01', moveOutDate: '2027-01-01' })).toBe(
    false,
  );
  expect(stayRangesOverlap(range, { moveInDate: '2026-10-01', moveOutDate: '2026-11-01' })).toBe(
    false,
  );
  expect(inventoryTargetsOverlap(bed, { ...bed, roomId: bed.bedId })).toBe(false);
  expect(inventoryTargetsOverlap(bed, { ...bed, bedId: roomId })).toBe(false);
  expect(inventoryTargetsOverlap(room, bed)).toBe(true);
  expect(inventoryTargetsOverlap(bed, room)).toBe(true);
  expect(inventoryTargetsOverlap(bed, { ...bed, roomId: roomId.toUpperCase() })).toBe(true);
});
it.each(['confirmed', 'manual_block', 'maintenance', 'active_stay'])(
  'ACC-001: %s blocks overlapping bed and whole-room requests',
  (state) => {
    expect(inventoryIsAvailable(bed, range, [{ ...claim, state }], now)).toBe(false);
    expect(inventoryIsAvailable(room, range, [{ ...claim, state }], now)).toBe(false);
    expect(inventoryIsAvailable(bed, range, [{ ...claim, state, target: room }], now)).toBe(false);
  },
);
it('BKG-006: holds expire at the exact server boundary and non-reserving requests do not block', () => {
  expect(inventoryIsAvailable(bed, range, [], now)).toBe(true);
  expect(
    inventoryIsAvailable(
      bed,
      range,
      [{ ...claim, state: 'hold', expiresAt: '2026-10-14T00:00:01Z' }],
      now,
    ),
  ).toBe(false);
  expect(
    inventoryIsAvailable(
      bed,
      range,
      [{ ...claim, state: 'hold', expiresAt: now.toISOString() }],
      now,
    ),
  ).toBe(true);
  expect(
    inventoryIsAvailable(
      bed,
      range,
      [
        {
          ...claim,
          state: 'pending_request',
          expiresAt: '2026-10-14T01:00:00Z',
          reservesInventory: false,
        },
      ],
      now,
    ),
  ).toBe(true);
  expect(
    inventoryIsAvailable(
      bed,
      range,
      [{ ...claim, range: { moveInDate: '2026-12-01', moveOutDate: '2027-01-01' } }],
      now,
    ),
  ).toBe(true);
});
it('SEC-001: malformed range, target, clock and immortal hold are rejected', () => {
  expect(() => stayRangeSchema.parse({ ...range, moveOutDate: range.moveInDate })).toThrow();
  expect(() => stayRangeSchema.parse({ ...range, moveInDate: '2026-02-30' })).toThrow();
  expect(() => inventoryTargetSchema.parse({ ...room, bedId: bed.bedId })).toThrow();
  expect(() => inventoryIsAvailable(bed, range, [{ ...claim, state: 'hold' }], now)).toThrow();
  expect(() => inventoryIsAvailable(bed, range, [], new Date('bad'))).toThrow();
});
