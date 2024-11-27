import { Queue, Worker } from 'bullmq';
import type { NotificationService } from '@hsm/notifications';
import { Redis } from 'ioredis';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { EmailProvider } from './delivery.js';
import type { FileScanService } from '@hsm/files';
import { processDelivery, type BillingDelivery } from './process-delivery.js';
import type { OutboxRepository } from './repository.js';
const jobSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dispatch') }).strict(),
  z.object({ type: z.literal('visit-follow-up') }).strict(),
  z.object({ type: z.literal('waitlist-reconcile') }).strict(),
  z.object({ type: z.literal('rent-overdue') }).strict(),
  z.object({ type: z.literal('deliver'), outboxId: z.string().uuid() }).strict(),
]);
export async function startWorker(
  repository: OutboxRepository,
  provider: EmailProvider,
  emailKey: Buffer,
  redisUrl: string,
  logger: Logger,
  files?: Pick<FileScanService, 'deliver'>,
  notices?: Pick<NotificationService, 'deliver'>,
  inventory?: { sweep(now: Date): Promise<number> },
  billing?: BillingDelivery,
  visits?: { sweep(now: Date): Promise<number> },
  waitlists?: { sweep(now: Date): Promise<number> },
  realtime?: BillingDelivery,
  rent?: { sweep(now: Date): Promise<number> },
  announcements?: BillingDelivery,
) {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', () =>
    logger.error({ code: 'QUEUE_CONNECTION_FAILED' }, 'Queue unavailable'),
  );
  const queue = new Queue('notification-outbox', { connection });
  const worker = new Worker(
    'notification-outbox',
    async (job) => {
      try {
        const input = jobSchema.parse(job.data as unknown);
        const now = new Date();
        if (input.type === 'waitlist-reconcile') {
          if (!waitlists) throw new Error('Waiting-list reconciliation unavailable');
          if ((await waitlists.sweep(now)) === 100)
            await queue.add(
              'waitlist-reconcile',
              { type: 'waitlist-reconcile' },
              {
                removeOnComplete: { age: 3600, count: 100 },
                removeOnFail: { age: 86400, count: 100 },
              },
            );
          return;
        }
        // RB-002 / NTF-001: overdue rent notices; a full batch re-queues the remainder.
        if (input.type === 'rent-overdue') {
          if (!rent) throw new Error('Rent notices unavailable');
          if ((await rent.sweep(now)) === 100)
            await queue.add(
              'rent-overdue',
              { type: 'rent-overdue' },
              {
                removeOnComplete: { age: 3600, count: 100 },
                removeOnFail: { age: 86400, count: 100 },
              },
            );
          return;
        }
        if (input.type === 'visit-follow-up') {
          if (!visits) throw new Error('Visit follow-up unavailable');
          if ((await visits.sweep(now)) === 100)
            await queue.add(
              'visit-follow-up',
              { type: 'visit-follow-up' },
              {
                removeOnComplete: { age: 3600, count: 100 },
                removeOnFail: { age: 86400, count: 100 },
              },
            );
          return;
        }
        if (input.type === 'dispatch') {
          await dispatchOutbox(queue, repository, now, inventory);
          return;
        }
        const row = await repository.claim(input.outboxId, now);
        if (!row) return;
        await processDelivery(
          row,
          repository,
          provider,
          emailKey,
          logger,
          files,
          notices,
          billing,
          realtime,
          announcements,
        );
      } catch {
        throw new Error('JOB_FAILED');
      }
    },
    { connection, concurrency: 5 },
  );
  worker.on('error', () => logger.error({ code: 'WORKER_FAILED' }, 'Worker unavailable'));
  worker.on('failed', () => logger.warn({ code: 'JOB_FAILED' }, 'Notification job failed'));
  try {
    await worker.waitUntilReady();
    await queue.upsertJobScheduler(
      'outbox-dispatch',
      { every: 1000 },
      {
        name: 'dispatch',
        data: { type: 'dispatch' },
        opts: {
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 86400, count: 100 },
        },
      },
    );
    if (waitlists)
      await queue.upsertJobScheduler(
        'waitlist-reconcile',
        { every: 60000 },
        {
          name: 'waitlist-reconcile',
          data: { type: 'waitlist-reconcile' },
          opts: {
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 86400, count: 100 },
          },
        },
      );
    if (rent)
      await queue.upsertJobScheduler(
        'rent-overdue',
        { every: 3600000 },
        {
          name: 'rent-overdue',
          data: { type: 'rent-overdue' },
          opts: {
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 86400, count: 100 },
          },
        },
      );
    if (visits)
      await queue.upsertJobScheduler(
        'visit-follow-up',
        { every: 86400000 },
        {
          name: 'visit-follow-up',
          data: { type: 'visit-follow-up' },
          opts: {
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 86400, count: 100 },
          },
        },
      );
    return {
      async close() {
        await worker.close();
        await queue.close();
        await connection.quit();
      },
    };
  } catch {
    await Promise.allSettled([worker.close(), queue.close()]);
    connection.disconnect();
    throw new Error('QUEUE_START_FAILED');
  }
}

async function dispatchOutbox(
  queue: Queue,
  repository: OutboxRepository,
  now: Date,
  inventory?: { sweep(now: Date): Promise<number> },
) {
  await inventory?.sweep(now);
  for (const row of await repository.due(now))
    await queue.add(
      'deliver',
      { type: 'deliver', outboxId: row.id },
      {
        // AUD-013: explicit recovery resets the bounded DB budget, while old
        // failed BullMQ jobs remain retained. Persisted due time distinguishes
        // that fresh budget and stays stable for duplicate dispatch of one attempt.
        jobId: row.id + '-' + row.attempts + '-' + row.nextAttemptAt.getTime(),
        attempts: 1,
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 1000 },
      },
    );
}
