import { expect } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  residentPayments,
  residentReceipts,
  hostelAuditLog,
  notificationOutbox,
} from '../src/index.js';
import type { admitManualResident } from '../src/resident-manual-admission.js';
import type { inventoryHarness } from './inventory.fixture.js';
export async function expectAdmissionFinancialAndEventState(
  harness: ReturnType<typeof inventoryHarness>,
  f: { ownerId: string; branchId: string },
  result: Awaited<ReturnType<typeof admitManualResident>>,
) {
  expect(
    await harness
      .database()
      .select()
      .from(residentPayments)
      .where(eq(residentPayments.stayId, result.stayId)),
  ).toEqual([]);
  expect(
    await harness
      .database()
      .select()
      .from(residentReceipts)
      .where(eq(residentReceipts.stayId, result.stayId)),
  ).toEqual([]);
  const [audit] = await harness
    .database()
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, result.stayId),
        eq(hostelAuditLog.action, 'resident.manual.admitted'),
      ),
    );
  expect(audit).toMatchObject({ actorUserId: f.ownerId, actorRole: 'owner', branchId: f.branchId });
  const event = await harness
    .database()
    .select()
    .from(notificationOutbox)
    .where(sql`${notificationOutbox.payload}->>'stayId' = ${result.stayId}`);
  // NTF-002 lifecycle event plus the RENT-001 rent-due notice for the issued first invoice.
  expect(event).toHaveLength(2);
  expect(event.find((row) => row.eventType === 'resident.lifecycle')).toMatchObject({
    channel: 'in_app',
    recipientUserId: null,
    payload: { event: 'resident.admitted', stayId: result.stayId },
  });
  expect(event.find((row) => row.eventType === 'resident.rent')).toMatchObject({
    channel: 'in_app',
    recipientUserId: null,
    payload: { event: 'rent.due', stayId: result.stayId },
  });
}
