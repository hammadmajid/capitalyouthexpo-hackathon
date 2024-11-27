import {
  sweepExpiredInventory,
  deliverResidentBilling,
  deliverAnnouncement,
  sweepVisitFollowUps,
  sweepWaitlistAvailability,
  sweepRentOverdue,
} from '@hsm/db';
import pino from 'pino';
import { Redis } from 'ioredis';
import { ChatRealtimeDelivery } from './chat-realtime.js';
import { NotificationRepository, NotificationService } from '@hsm/notifications';
import {
  S3Storage,
  storageConfig,
  ClamScanner,
  FileScanRepository,
  FileScanService,
} from '@hsm/files';
import { createDatabase } from '@hsm/db';
import { workerConfig } from './config.js';
import { OutboxRepository } from './repository.js';
import { smtpProvider } from './smtp.js';
import { startWorker } from './runtime.js';
import { billingRecoveryCli } from './billing-recovery-cli.js';
const logger = pino({ level: 'info' });
async function main() {
  if (process.argv.length > 2) {
    await billingRecoveryCli(process.argv.slice(2), process.env, logger);
    return;
  }
  const config = workerConfig(process.env);
  const storageOptions = storageConfig(process.env);
  const scanner = new ClamScanner({
    host: process.env.CLAMAV_HOST ?? '',
    port: Number(process.env.CLAMAV_PORT),
  });
  logger.level = config.LOG_LEVEL;
  const database = createDatabase(config.DATABASE_URL);
  const provider = smtpProvider(config);
  const storage = new S3Storage(storageOptions);
  const publisher = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    commandTimeout: 3000,
  });
  publisher.on('error', () =>
    logger.error({ code: 'CHAT_PUBLISH_FAILED' }, 'Chat delivery unavailable'),
  );
  try {
    await publisher.connect();
    const worker = await startWorker(
      new OutboxRepository(database.db),
      provider,
      Buffer.from(config.EMAIL_ENVELOPE_KEY, 'hex'),
      config.REDIS_URL,
      logger,
      new FileScanService(
        new FileScanRepository(database.db, storageOptions.S3_PRIVATE_BUCKET),
        storage,
        scanner,
      ),
      new NotificationService(new NotificationRepository(database.db)),
      { sweep: (now) => sweepExpiredInventory(database.db, now) },
      { deliver: (row) => deliverResidentBilling(database.db, row) },
      config.VISITS_ENABLED ? { sweep: (now) => sweepVisitFollowUps(database.db, now) } : undefined,
      { sweep: (now) => sweepWaitlistAvailability(database.db, now) },
      new ChatRealtimeDelivery(database.db, publisher),
      { sweep: (now) => sweepRentOverdue(database.db, now) },
      {
        deliver: async (row) => {
          await deliverAnnouncement(database.db, row);
        },
      },
    );
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await worker.close();
      publisher.disconnect();
      provider.close();
      storage.close();
      await database.close();
    };
    for (const signal of ['SIGTERM', 'SIGINT'] as const)
      process.once(signal, () => {
        void close().catch(() => {
          logger.error({ code: 'SHUTDOWN_FAILED' }, 'Worker shutdown failed');
          process.exitCode = 1;
        });
      });
    logger.info({ service: 'worker' }, 'Worker ready');
  } catch {
    publisher.disconnect();
    provider.close();
    storage.close();
    await database.close();
    throw new Error('WORKER_START_FAILED');
  }
}
void main().catch(() => {
  logger.error({ code: 'STARTUP_FAILED' }, 'Worker startup failed');
  process.exitCode = 1;
});
