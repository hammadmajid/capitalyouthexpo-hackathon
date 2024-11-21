import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { bookingPaymentProofs, bookings, branches, managerAssignments } from '@hsm/db';
import type { NotificationTransaction } from './producer.js';
import { bookingStaffNoticeEligible } from './booking-eligibility.js';
const ownerId = randomUUID(),
  managerId = randomUUID(),
  branchId = randomUUID(),
  operationId = randomUUID();
function transaction(rows: Map<unknown, unknown[]>) {
  function select() {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      innerJoin: () => query,
      where: () => query,
      limit: () => query,
      then(resolve: (value: unknown[]) => unknown) {
        return Promise.resolve(rows.get(table) ?? []).then(resolve);
      },
    };
    return query;
  }
  return { select } as unknown as NotificationTransaction;
}
const staff = (grants: string[]) =>
  new Map<unknown, unknown[]>([
    [branches, [{ userId: ownerId }]],
    [managerAssignments, grants.map((permission) => ({ userId: managerId, permission }))],
  ]);
it('NTF-002 / ACC-002: received-booking notices require live booking authority at delivery', async () => {
  const rows = staff(['booking_manage']);
  rows.set(bookings, [{ branchId }]);
  expect(
    await bookingStaffNoticeEligible(transaction(rows), managerId, 'booking.received', operationId),
  ).toBe(true);
  expect(
    await bookingStaffNoticeEligible(transaction(rows), ownerId, 'booking.received', operationId),
  ).toBe(true);
  const revoked = staff([]);
  revoked.set(bookings, [{ branchId }]);
  expect(
    await bookingStaffNoticeEligible(
      transaction(revoked),
      managerId,
      'booking.received',
      operationId,
    ),
  ).toBe(false);
  expect(
    await bookingStaffNoticeEligible(
      transaction(staff(['booking_manage'])),
      ownerId,
      'booking.received',
      operationId,
    ),
  ).toBe(false);
});
it('SRS v2.11 / CHG-010: proof review notices need every review grant and a still-pending proof', async () => {
  const full = staff(['booking_manage', 'payment_record', 'finance_view']);
  full.set(bookingPaymentProofs, [{ branchId, state: 'submitted' }]);
  expect(
    await bookingStaffNoticeEligible(
      transaction(full),
      managerId,
      'booking.payment_review',
      operationId,
    ),
  ).toBe(true);
  const partial = staff(['booking_manage', 'payment_record']);
  partial.set(bookingPaymentProofs, [{ branchId, state: 'submitted' }]);
  expect(
    await bookingStaffNoticeEligible(
      transaction(partial),
      managerId,
      'booking.payment_review',
      operationId,
    ),
  ).toBe(false);
  const reviewed = staff(['booking_manage', 'payment_record', 'finance_view']);
  reviewed.set(bookingPaymentProofs, [{ branchId, state: 'approved' }]);
  expect(
    await bookingStaffNoticeEligible(
      transaction(reviewed),
      ownerId,
      'booking.payment_review',
      operationId,
    ),
  ).toBe(false);
  const ownerless = new Map<unknown, unknown[]>([
    [bookingPaymentProofs, [{ branchId, state: 'submitted' }]],
  ]);
  expect(
    await bookingStaffNoticeEligible(
      transaction(ownerless),
      ownerId,
      'booking.payment_review',
      operationId,
    ),
  ).toBe(false);
});
