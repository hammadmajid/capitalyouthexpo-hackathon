import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import {
  deliverResidentBilling,
  recoverResidentBilling,
  notificationOutbox,
  residentInvoices,
  residentBillingExecutions,
} from '@hsm/db';
import { OutboxRepository } from '../src/repository.js';
import { startWorker } from '../src/runtime.js';
import { workerFixture } from './fixture.js';
import { stoppedBillingFixture } from './billing.fixture.js';
let f: Awaited<ReturnType<typeof workerFixture>>;
beforeAll(async () => {
  f = await workerFixture();
});
afterAll(async () => {
  await f?.close();
});
const logger = pino({ level: 'silent' });
async function read(id: string) {
  const [row] = await f.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, id));
  if (!row) throw new Error('Missing Redis recovery job');
  return row;
}
function start(billing: Parameters<typeof startWorker>[8]) {
  return startWorker(
    new OutboxRepository(f.database.db),
    {
      send: async () => {
        throw new Error('Billing must not use SMTP');
      },
    },
    randomBytes(32),
    f.redisUrl,
    logger,
    undefined,
    undefined,
    undefined,
    billing,
  );
}
it('AUD-013 / RENT-004 / NTF-002: actual Redis dispatcher resumes recovered billing while the original failed attempt remains retained', async () => {
  const item = await stoppedBillingFixture(f.database.db, true);
  const connection = new Redis(f.redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<{ type: string; outboxId?: string }>('notification-outbox', {
    connection,
  });
  let running: Awaited<ReturnType<typeof start>> | undefined;
  try {
    running = await start({
      deliver: async () => {
        throw new Error('Fixture transient failure');
      },
    });
    await expect
      .poll(async () => (await read(item.jobId)).status, { timeout: 5000, interval: 50 })
      .toBe('failed');
    await running.close();
    running = undefined;
    const jobs = await queue.getJobs(['failed']);
    const original = jobs.find((job) => job.data.outboxId === item.jobId);
    expect(original).toBeDefined();
    const repo = new OutboxRepository(f.database.db);
    for (let attempt = 2; attempt <= 5; attempt++) {
      const previous = await read(item.jobId);
      const claimed = await repo.claim(item.jobId, previous.nextAttemptAt);
      expect(claimed?.attempts).toBe(attempt);
      if (!claimed) throw new Error('Missing exhausted fixture lease');
      await repo.failed(claimed, 'DELIVERY_FAILED', previous.nextAttemptAt);
    }
    expect(await read(item.jobId)).toMatchObject({ status: 'dead', attempts: 5 });
    await recoverResidentBilling(f.database.db, {
      branchId: item.branchId,
      jobId: item.jobId,
      expectedAttempts: 5,
      incident: 'INC-REDIS-013',
    });
    running = await start({ deliver: (row) => deliverResidentBilling(f.database.db, row) });
    await expect
      .poll(async () => (await read(item.jobId)).status, { timeout: 5000, interval: 50 })
      .toBe('sent');
    expect(await queue.getJobState(original?.id ?? '')).toBe('failed');
    expect(
      await f.database.db
        .select()
        .from(residentInvoices)
        .where(eq(residentInvoices.stayId, item.stayId)),
    ).toHaveLength(1);
    expect(
      await f.database.db
        .select()
        .from(residentBillingExecutions)
        .where(eq(residentBillingExecutions.jobId, item.jobId)),
    ).toHaveLength(1);
  } finally {
    await running?.close();
    await queue.close();
    await connection.quit();
  }
});
