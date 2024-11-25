import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  files,
  residentPayments,
  residentReceipts,
  notificationOutbox,
  hostelAuditLog,
} from '@hsm/db';
import { verifiedKey } from '@hsm/files';
import type { phaseTwoFixture } from './phase-two-fixture.js';
import { invoiceFixture } from './stay-invoice.fixture.js';
type Fixture = Awaited<ReturnType<typeof phaseTwoFixture>>;
export async function paymentFixture(f: Fixture, userId?: string | null) {
  const item = await invoiceFixture(f, userId);
  return {
    ...item,
    input: {
      amountPaisa: 1800001,
      method: 'cash',
      paidOn: '2026-10-04',
      note: 'Received directly by hostel',
      allocations: [{ invoiceId: item.invoiceId, amountPaisa: 1800001 }],
      depositPaisa: 0,
      advanceCreditPaisa: 0,
    },
  };
}
export type PaymentFixture = Awaited<ReturnType<typeof paymentFixture>>;
export function recordPayment(
  f: Fixture,
  item: PaymentFixture,
  key = randomUUID(),
  token = f.ownerToken,
  body: unknown = item.input,
) {
  return f.application.inject({
    method: 'POST',
    url: '/v1/branches/' + item.branchId + '/stays/' + item.stayId + '/payments',
    headers: {
      authorization: 'Bearer ' + token,
      'idempotency-key': key,
      'content-type': 'application/json',
    },
    payload: JSON.stringify(body),
  });
}
export async function financialCounts(f: Fixture, item: PaymentFixture) {
  return Promise.all(
    [residentPayments, residentReceipts].map(
      async (table) =>
        (await f.connection.db.select().from(table).where(eq(table.stayId, item.stayId))).length,
    ),
  );
}
export async function ownProof(f: Fixture, uploader = f.ownerId, clean = true) {
  const id = randomUUID();
  await f.connection.db.insert(files).values({
    id,
    uploadedBy: uploader,
    bucket: f.storage.bucket,
    visibility: 'private',
    objectKey: verifiedKey('payment_proof', id),
    mimeType: 'application/pdf',
    sizeBytes: 100n,
    purpose: 'payment_proof',
    scanStatus: clean ? 'clean' : 'pending',
    sha256: clean ? Buffer.alloc(32, 1) : null,
  });
  return id;
}
export async function paymentNotices(f: Fixture, paymentId: string) {
  return f.connection.db
    .select()
    .from(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.eventType, 'notification.create'),
        sql`${notificationOutbox.payload}->>'operationId' = ${paymentId}`,
      ),
    );
}
export async function paymentAudits(f: Fixture, branchId: string) {
  return f.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, branchId),
        eq(hostelAuditLog.action, 'resident.payment.recorded'),
      ),
    );
}
export async function rejectPaymentNotice(f: Fixture) {
  await f.connection.db.execute(
    sql`create function hsm_test_payment_notice_failure() returns trigger language plpgsql as $$ begin if NEW.event_type = 'notification.create' and NEW.payload->>'event' = 'resident.payment_recorded' then raise exception 'Fixture payment notice failure' using errcode='P0001'; end if; return NEW; end; $$`,
  );
  await f.connection.db.execute(
    sql`create trigger hsm_test_payment_notice_failure before insert on notification_outbox for each row execute function hsm_test_payment_notice_failure()`,
  );
}
export async function restorePaymentNotice(f: Fixture) {
  await f.connection.db.execute(
    sql`drop trigger if exists hsm_test_payment_notice_failure on notification_outbox`,
  );
  await f.connection.db.execute(sql`drop function if exists hsm_test_payment_notice_failure()`);
}
