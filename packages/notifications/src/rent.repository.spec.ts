import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { notificationOutbox, readResidentInvoiceBalance, stays, type Database } from '@hsm/db';
import type { ResidentRentLease } from './contracts.js';
import { NotificationRepository } from './repository.js';
import { NotificationService } from './service.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalance: vi.fn(),
}));
const now = new Date('2028-02-10T06:00:00Z');
const ids = { stay: randomUUID(), branch: randomUUID(), invoice: randomUUID(), user: randomUUID() };
function lease(event: 'rent.due' | 'rent.overdue' = 'rent.due'): ResidentRentLease {
  return {
    id: randomUUID(),
    eventType: 'resident.rent',
    channel: 'in_app',
    recipientUserId: null,
    payload: { event, stayId: ids.stay, invoiceId: ids.invoice },
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(now.getTime() + 60000),
  };
}
function double(
  value: ResidentRentLease,
  change: Record<string, unknown> = {},
  userId?: string | null,
) {
  const writes: unknown[] = [],
    updates: unknown[] = [];
  const row = {
    ...value,
    payload: { ...value.payload },
    status: 'pending',
    ...change,
  };
  const stay = {
    id: ids.stay,
    branchId: ids.branch,
    userId: userId === undefined ? ids.user : userId,
  };
  const tx = {
    select: () => {
      let table: unknown;
      const chain = {
        from(value: unknown) {
          table = value;
          return chain;
        },
        where: () => chain,
        for: () => Promise.resolve(table === notificationOutbox ? [row] : []),
        limit: () => Promise.resolve(table === stays ? [stay] : []),
      };
      return chain;
    },
    insert: () => ({
      values(value: unknown) {
        writes.push(value);
        return { onConflictDoNothing: () => Promise.resolve() };
      },
    }),
    update: () => ({
      set(value: unknown) {
        updates.push(value);
        return { where: () => Promise.resolve() };
      },
    }),
  };
  const database = {
    transaction: (work: (t: unknown) => unknown) => work(tx),
  } as unknown as Database;
  return { repository: new NotificationRepository(database, () => now), writes, updates };
}
const balance = (state: string) => ({ state }) as never;
beforeEach(() => vi.resetAllMocks());
it('NTF-001 / NTF-003: rent due notifies only the linked account while the invoice is open', async () => {
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(balance('issued'));
  const value = lease(),
    f = double(value);
  expect(await f.repository.publishRent(value, now)).toBe(true);
  expect(f.writes).toEqual([
    expect.objectContaining({
      eventType: 'notification.create',
      recipientUserId: ids.user,
      payload: { event: 'resident.rent_due', operationId: value.id },
    }),
  ]);
  expect(f.updates).toEqual([expect.objectContaining({ status: 'sent', leaseToken: null })]);
  expect(readResidentInvoiceBalance).toHaveBeenCalledWith(expect.anything(), {
    branchId: ids.branch,
    stayId: ids.stay,
    invoiceId: ids.invoice,
    today: '2028-02-10',
  });
});
it.each([
  ['rent.due', 'paid'],
  ['rent.due', 'voided'],
  ['rent.overdue', 'issued'],
  ['rent.overdue', 'partially_paid'],
] as const)('RB-002: %s is suppressed when the balance is %s', async (event, state) => {
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(balance(state));
  const value = lease(event),
    f = double(value);
  expect(await f.repository.publishRent(value, now)).toBe(true);
  expect(f.writes).toEqual([]);
  expect(f.updates).toHaveLength(1);
});
it('RB-002: an overdue balance sends the overdue notice', async () => {
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(balance('overdue'));
  const value = lease('rent.overdue'),
    f = double(value);
  expect(await f.repository.publishRent(value, now)).toBe(true);
  expect(f.writes).toEqual([
    expect.objectContaining({ payload: { event: 'resident.rent_overdue', operationId: value.id } }),
  ]);
});
it('NTF-003: an unlinked Stay is acknowledged without a recipient or balance read', async () => {
  const value = lease(),
    f = double(value, {}, null);
  expect(await f.repository.publishRent(value, now)).toBe(true);
  expect(f.writes).toEqual([]);
  expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
});
it.each([
  [{ status: 'sent' }],
  [{ leaseToken: randomUUID() }],
  [{ eventType: 'resident.lifecycle' }],
  [{ payload: { event: 'rent.due', stayId: ids.stay, invoiceId: randomUUID() } }],
  [{ payload: { bad: true } }],
])('SEC-003: a stale or mismatched lease %j publishes nothing', async (change) => {
  const value = lease(),
    f = double(value, change);
  expect(await f.repository.publishRent(value, now)).toBe(false);
  expect(f.writes).toEqual([]);
  expect(f.updates).toEqual([]);
});
it('NTF-001: the service routes rent events and rejects stores without rent support', async () => {
  const value = lease();
  const publishRent = vi.fn().mockResolvedValue(true);
  const store = {
    publishResident: vi.fn(),
    publishBooking: vi.fn(),
    publish: vi.fn(),
  };
  await new NotificationService({ ...store, publishRent }, () => now).deliver(value);
  expect(publishRent).toHaveBeenCalledWith(expect.objectContaining({ id: value.id }), now);
  await expect(new NotificationService(store, () => now).deliver(value)).rejects.toThrow();
});
