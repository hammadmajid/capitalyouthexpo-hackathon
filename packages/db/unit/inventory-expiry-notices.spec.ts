import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { bookingHolds, bookings, branches, inventoryClaims } from '../src/schema/index.js';
import {
  enqueueBookingLifecycle,
  type BookingLifecycleTransaction,
} from '../src/booking-lifecycle.js';
import { expireRoomReservations } from '../src/inventory-expiry.js';
vi.mock('../src/booking-lifecycle.js', async (original) => ({
  ...(await original<typeof import('../src/booking-lifecycle.js')>()),
  enqueueBookingLifecycle: vi.fn(),
}));
const roomId = randomUUID(),
  branchId = randomUUID(),
  bookingId = randomUUID(),
  holdId = randomUUID(),
  organizationId = randomUUID();
const now = new Date('2026-10-16T00:00:00Z');
beforeEach(() => vi.resetAllMocks());
function fixture(
  mode: 'reserving' | 'nonreserving' | 'hold',
  invalidBooking = false,
  missingBranch = false,
) {
  const expired =
    mode === 'nonreserving'
      ? []
      : [
          {
            id: randomUUID(),
            branchId,
            roomId,
            bookingId: mode === 'reserving' ? bookingId : null,
            holdId: mode === 'hold' ? holdId : null,
          },
        ];
  const data = new Map<unknown, unknown[][]>([
    [inventoryClaims, [expired]],
    [branches, [missingBranch ? [] : [{ organizationId }]]],
    [
      bookings,
      mode === 'reserving'
        ? [[{ state: invalidBooking ? 'confirmed' : 'pending_request' }], []]
        : mode === 'nonreserving'
          ? [[{ id: bookingId, branchId }]]
          : [[]],
    ],
  ]);
  const writes: { table: unknown; value: unknown }[] = [],
    predicates: { table: unknown; value: SQL }[] = [];
  function select() {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where(value: SQL) {
        predicates.push({ table, value });
        return query;
      },
      orderBy() {
        return query;
      },
      for() {
        return query;
      },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(data.get(table)?.shift() ?? []).then(resolve, reject);
      },
    };
    return query;
  }
  // Unit-only write/query double. Real rollback and exclusion guards remain container gates.
  const transaction = {
    select,
    insert: (table: unknown) => ({
      values: async (value: unknown) => {
        writes.push({ table, value });
      },
    }),
    update: (table: unknown) => ({
      set: (value: unknown) => {
        writes.push({ table, value });
        return { where: async () => undefined };
      },
    }),
  } as unknown as BookingLifecycleTransaction;
  return { transaction, writes, predicates };
}
it.each(['reserving', 'nonreserving', 'hold'] as const)(
  'NTF-002 ACC-001: %s expiry queues only actual expired booking events',
  async (mode) => {
    const value = fixture(mode);
    expect(await expireRoomReservations(value.transaction, roomId, now)).toBe(1);
    const predicate = value.predicates.find((entry) => entry.table === inventoryClaims);
    if (!predicate) throw new Error('Expiry predicate missing');
    expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([roomId, now.toISOString()]);
    if (mode === 'hold') {
      expect(enqueueBookingLifecycle).not.toHaveBeenCalled();
      expect(value.writes.some((write) => write.table === bookingHolds)).toBe(true);
    } else
      expect(enqueueBookingLifecycle).toHaveBeenCalledWith(
        value.transaction,
        { event: 'booking.expired', bookingId },
        now,
      );
  },
);
it('ACC-001 NTF-002: confirmed booking claims cannot be expired or announced as expired', async () => {
  const value = fixture('reserving', true);
  await expect(expireRoomReservations(value.transaction, roomId, now)).rejects.toThrow(
    'Invalid expiring booking claim',
  );
  expect(value.writes).toHaveLength(0);
  expect(enqueueBookingLifecycle).not.toHaveBeenCalled();
});
it('ACC-001 NTF-002: an outbox failure propagates to the transaction owning expiry', async () => {
  const value = fixture('nonreserving');
  vi.mocked(enqueueBookingLifecycle).mockRejectedValue(new Error('Outbox unavailable'));
  await expect(expireRoomReservations(value.transaction, roomId, now)).rejects.toThrow(
    'Outbox unavailable',
  );
});
it('ACC-004 NTF-002: absent branch source fails before mutation or notice creation', async () => {
  const value = fixture('reserving', false, true);
  await expect(expireRoomReservations(value.transaction, roomId, now)).rejects.toThrow(
    'branch unavailable',
  );
  expect(value.writes).toHaveLength(0);
  expect(enqueueBookingLifecycle).not.toHaveBeenCalled();
});
