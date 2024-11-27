import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  deliverResidentBilling,
  residentInvoices,
  residentBillingExecutions,
  residentBillingSchedules,
  residentBillingOrigins,
  hostelAuditLog,
  notificationOutbox,
  residentCharges,
  residentLedger,
  residentInvoiceCharges,
} from '@hsm/db';
import { OutboxRepository } from '../src/repository.js';
import { workerFixture } from './fixture.js';
import { stoppedBillingFixture } from './billing.fixture.js';
let f: Awaited<ReturnType<typeof workerFixture>>;
beforeAll(async () => {
  f = await workerFixture();
});
afterAll(async () => {
  await f?.close();
});
it('AUD-015 / ACC-004: disposable pg_dump/pg_restore preserves immutable finance, audits and sent-job replay protection', async () => {
  const item = await stoppedBillingFixture(f.database.db, true);
  const leased = await new OutboxRepository(f.database.db).claim(item.jobId, new Date());
  if (!leased) throw new Error('Missing backup fixture lease');
  await deliverResidentBilling(f.database.db, leased);
  const restored = await f.restoreDisposableBackup();
  try {
    for (const table of [
      residentInvoices,
      residentCharges,
      residentLedger,
      residentInvoiceCharges,
      residentBillingOrigins,
      residentBillingExecutions,
      residentBillingSchedules,
      hostelAuditLog,
      notificationOutbox,
    ]) {
      const original = await f.database.db.select().from(table);
      const copy = await restored.db.select().from(table);
      expect(copy).toHaveLength(original.length);
      expect(copy).toEqual(expect.arrayContaining(original));
    }
    await deliverResidentBilling(restored.db, leased);
    expect(
      await restored.db
        .select()
        .from(residentInvoices)
        .where(eq(residentInvoices.stayId, item.stayId)),
    ).toHaveLength(1);
    expect(
      await restored.db
        .select()
        .from(residentBillingExecutions)
        .where(eq(residentBillingExecutions.jobId, item.jobId)),
    ).toHaveLength(1);
    const [job] = await restored.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, item.jobId));
    expect(job).toMatchObject({ status: 'sent', leaseToken: null });
    expect(
      await restored.db
        .select()
        .from(hostelAuditLog)
        .where(
          and(
            eq(hostelAuditLog.branchId, item.branchId),
            eq(hostelAuditLog.action, 'billing.execution.completed'),
          ),
        ),
    ).toHaveLength(1);
    // Restored constraints/triggers must still reject historical money mutation.
    await expect(
      restored.db
        .update(residentInvoices)
        .set({ totalPaisa: 1800001n })
        .where(eq(residentInvoices.stayId, item.stayId)),
    ).rejects.toThrow();
  } finally {
    await restored.close();
  }
});
