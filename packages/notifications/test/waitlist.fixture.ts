import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import {
  notificationOutbox,
  waitlistEntries,
  waitlistAvailability,
  waitlistFanoutPages,
  waitlistVacancyEvents,
  type Database,
} from '@hsm/db';
import { NotificationRepository } from '../src/repository.js';
import type { NotificationTransaction, WaitlistLifecycleLease } from '../src/index.js';
export const now = new Date('2026-10-24T03:00:00Z');
export const branchId = randomUUID(),
  customerId = randomUUID(),
  eventId = randomUUID();
export const lease: WaitlistLifecycleLease = {
  id: randomUUID(),
  eventType: 'waitlist.lifecycle',
  channel: 'in_app',
  recipientUserId: null,
  payload: { event: 'waitlist.vacancy', pageId: randomUUID() },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
export function waitlistFixture(patch: Partial<typeof notificationOutbox.$inferSelect> = {}) {
  let clock = now,
    expireOnInsert = false;
  const row = { ...lease, status: 'pending', ...patch };
  const data = new Map<unknown, unknown[]>([
    [notificationOutbox, [row]],
    [waitlistFanoutPages, [{ id: lease.payload.pageId, branchId, eventId, afterEntryId: null }]],
    [
      waitlistVacancyEvents,
      [
        {
          id: eventId,
          branchId,
          roomTypeId: null,
          branchBecameAvailable: true,
          typeBecameAvailable: false,
          createdAt: now,
        },
      ],
    ],
    [waitlistAvailability, [{ roomTypeId: null }]],
    [waitlistEntries, [{ id: randomUUID(), userId: customerId }]],
  ]);
  const writes: { table: unknown; value: unknown }[] = [],
    filters: unknown[] = [];
  function select() {
    let table: unknown;
    const chain = {
      from(value: unknown) {
        table = value;
        return chain;
      },
      innerJoin() {
        return chain;
      },
      where(condition: unknown) {
        filters.push(condition);
        return chain;
      },
      for() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit() {
        return chain;
      },
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(data.get(table) ?? []).then(resolve, reject);
      },
    };
    return chain;
  }
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
  const tx = {
    select,
    update: () => ({ set }),
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        writes.push({ table, value });
        if (expireOnInsert) clock = lease.leaseExpiresAt;
        return {
          onConflictDoNothing: async () => undefined,
          then(resolve: () => unknown, reject: (error: unknown) => unknown) {
            return Promise.resolve().then(resolve, reject);
          },
        };
      },
    }),
  } as unknown as NotificationTransaction;
  const database = {
    transaction: (work: (transaction: NotificationTransaction) => Promise<boolean>) => work(tx),
  } as unknown as Database;
  return {
    data,
    filters,
    writes,
    set,
    tx,
    repository: new NotificationRepository(database, () => clock),
    expireAfterInsert() {
      expireOnInsert = true;
    },
    advanceClock(value: Date) {
      clock = value;
    },
  };
}
