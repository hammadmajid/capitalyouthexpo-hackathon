import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import pino from 'pino';
import {
  deliverResidentBilling,
  notificationOutbox,
  residentBillingExecutions,
  residentCharges,
  hostelAuditLog,
} from '@hsm/db';
import { OutboxRepository } from '../src/repository.js';
import { startWorker } from '../src/runtime.js';
import { workerFixture } from './fixture.js';
import { stoppedBillingFixture } from './billing.fixture.js';
let fixture: Awaited<ReturnType<typeof workerFixture>>;
beforeAll(async () => {
  fixture = await workerFixture();
});
afterAll(async () => {
  await fixture?.close();
});
async function read(id: string) {
  const [row] = await fixture.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, id));
  if (!row) throw new Error('Job missing');
  return row;
}
function start(billing: Parameters<typeof startWorker>[8]) {
  return startWorker(
    new OutboxRepository(fixture.database.db),
    {
      send: async () => {
        throw new Error('Billing must not use SMTP');
      },
    },
    randomBytes(32),
    fixture.redisUrl,
    pino({ level: 'silent' }),
    undefined,
    undefined,
    undefined,
    billing,
  );
}
it('RENT-004 / NTF-002: real Redis worker restart recovers failed stopped work and commits one execution with atomic acknowledgement', async () => {
  const f = await stoppedBillingFixture(fixture.database.db);
  const first = await start({
    deliver: async () => {
      throw new Error('Intentional transient fixture failure');
    },
  });
  try {
    await expect
      .poll(async () => (await read(f.jobId)).status, { timeout: 20000, interval: 100 })
      .toBe('failed');
  } finally {
    await first.close();
  }
  expect(await read(f.jobId)).toMatchObject({
    attempts: 1,
    lastError: 'DELIVERY_FAILED',
    leaseToken: null,
    leaseExpiresAt: null,
  });
  const recovered = await start({
    deliver: (row) => deliverResidentBilling(fixture.database.db, row),
  });
  try {
    await expect
      .poll(async () => (await read(f.jobId)).status, { timeout: 20000, interval: 100 })
      .toBe('sent');
    expect(await read(f.jobId)).toMatchObject({
      attempts: 2,
      lastError: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    await expectCompletion(f);
  } finally {
    await recovered.close();
  }
});

async function expectCompletion(f: Awaited<ReturnType<typeof stoppedBillingFixture>>) {
  const executions = await fixture.database.db
    .select()
    .from(residentBillingExecutions)
    .where(eq(residentBillingExecutions.stayId, f.stayId));
  expect(executions).toHaveLength(1);
  expect(executions[0]).toMatchObject({
    jobId: f.jobId,
    outcome: 'obsolete',
    chargeId: null,
    invoiceId: null,
  });
  const audit = await fixture.database.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, f.branchId),
        eq(hostelAuditLog.action, 'billing.execution.completed'),
      ),
    );
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ actorRole: 'system', actorUserId: null });
  expect(
    await fixture.database.db
      .select()
      .from(residentCharges)
      .where(eq(residentCharges.stayId, f.stayId)),
  ).toEqual([]);
}
