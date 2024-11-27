import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import type { OutboxRepository } from './repository.js';
const mocks = vi.hoisted(() => ({
  process: undefined as undefined | ((job: { data: unknown }) => Promise<void>),
  redisEvents: new Map<string, () => void>(),
  workerEvents: new Map<string, () => void>(),
  add: vi.fn(),
  scheduler: vi.fn(),
  ready: vi.fn(),
  workerClose: vi.fn(),
  queueClose: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn(),
  deliver: vi.fn(),
}));
vi.mock('ioredis', () => ({
  Redis: class {
    on(name: string, handler: () => void) {
      mocks.redisEvents.set(name, handler);
    }
    quit = mocks.quit;
    disconnect = mocks.disconnect;
  },
}));
vi.mock('bullmq', () => ({
  Queue: class {
    add = mocks.add;
    upsertJobScheduler = mocks.scheduler;
    close = mocks.queueClose;
  },
  Worker: class {
    constructor(_name: string, process: (job: { data: unknown }) => Promise<void>) {
      mocks.process = process;
    }
    on(name: string, handler: () => void) {
      mocks.workerEvents.set(name, handler);
    }
    waitUntilReady = mocks.ready;
    close = mocks.workerClose;
  },
}));
vi.mock('./delivery.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./delivery.js')>();
  return { ...original, deliverEmail: mocks.deliver };
});
import { startWorker } from './runtime.js';
import { DeliveryError } from './delivery.js';
import { InvalidChatRealtimeJob } from './chat-realtime.js';
const logger = { error: vi.fn(), warn: vi.fn() };
const store = { due: vi.fn(), claim: vi.fn(), sent: vi.fn(), failed: vi.fn() };
const id = randomUUID();
const dispatchAt = new Date('2026-10-28T10:00:00Z');
it('COMM-001 / NTF-002: realtime dispatch uses its lease-owning service and sanitizes invalid sources', async () => {
  const row = { id, channel: 'internal', eventType: 'chat.realtime' },
    realtime = { deliver: vi.fn().mockResolvedValue(undefined) };
  store.claim.mockResolvedValue(row);
  const worker = await startWorker(
    store as unknown as OutboxRepository,
    { send: vi.fn() },
    randomBytes(32),
    'redis://localhost:6379',
    logger as unknown as Logger,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    realtime,
  );
  await process({ type: 'deliver', outboxId: id });
  expect(realtime.deliver).toHaveBeenCalledWith(row);
  expect(store.sent).not.toHaveBeenCalled();
  realtime.deliver.mockRejectedValue(new InvalidChatRealtimeJob());
  await expect(process({ type: 'deliver', outboxId: id })).rejects.toThrow('JOB_FAILED');
  expect(store.failed).toHaveBeenCalledWith(row, 'INVALID_MESSAGE', expect.any(Date));
  await worker.close();
});
it('COMM-001: unconfigured realtime delivery cannot acknowledge source data', async () => {
  const row = { id, channel: 'internal', eventType: 'chat.realtime' };
  store.claim.mockResolvedValue(row);
  const worker = await start();
  await expect(process({ type: 'deliver', outboxId: id })).rejects.toThrow('JOB_FAILED');
  expect(store.failed).toHaveBeenCalledWith(row, 'DELIVERY_FAILED', expect.any(Date));
  expect(store.sent).not.toHaveBeenCalled();
  await worker.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.redisEvents.clear();
  mocks.workerEvents.clear();
  mocks.ready.mockResolvedValue(undefined);
  mocks.scheduler.mockResolvedValue(undefined);
  mocks.deliver.mockResolvedValue('provider-id');
  store.due.mockResolvedValue([{ id, attempts: 0, nextAttemptAt: dispatchAt }]);
  store.claim.mockResolvedValue({ id });
  store.failed.mockResolvedValue(undefined);
});
const start = () =>
  startWorker(
    store as unknown as OutboxRepository,
    { send: vi.fn() },
    randomBytes(32),
    'redis://localhost:6379',
    logger as unknown as Logger,
  );
async function process(data: unknown) {
  if (!mocks.process) throw new Error('Worker missing');
  await mocks.process({ data });
}
it('NTF-002: dispatches ID-only jobs, sends leased rows and closes queue connections', async () => {
  const worker = await start();
  expect(mocks.scheduler).toHaveBeenCalledWith(
    'outbox-dispatch',
    { every: 1000 },
    expect.any(Object),
  );
  await process({ type: 'dispatch' });
  expect(mocks.add).toHaveBeenCalledWith(
    'deliver',
    { type: 'deliver', outboxId: id },
    expect.objectContaining({ jobId: id + '-0-' + dispatchAt.getTime(), attempts: 1 }),
  );
  await process({ type: 'deliver', outboxId: id });
  expect(store.sent).toHaveBeenCalledWith({ id }, 'provider-id', expect.any(Date));
  store.claim.mockResolvedValue(undefined);
  await process({ type: 'deliver', outboxId: id });
  expect(mocks.deliver).toHaveBeenCalledTimes(1);
  mocks.redisEvents.get('error')?.();
  mocks.workerEvents.get('error')?.();
  mocks.workerEvents.get('failed')?.();
  expect(logger.error).toHaveBeenCalledWith(
    { code: 'QUEUE_CONNECTION_FAILED' },
    expect.any(String),
  );
  expect(logger.error).toHaveBeenCalledWith({ code: 'WORKER_FAILED' }, expect.any(String));
  expect(logger.warn).toHaveBeenCalledWith({ code: 'JOB_FAILED' }, expect.any(String));
  await worker.close();
  expect(mocks.workerClose).toHaveBeenCalled();
  expect(mocks.queueClose).toHaveBeenCalled();
  expect(mocks.quit).toHaveBeenCalled();
});
it('AUD-013 / NTF-002: duplicate dispatch is stable but an explicit fresh budget cannot collide with retained failed attempts', async () => {
  const worker = await start();
  await process({ type: 'dispatch' });
  await process({ type: 'dispatch' });
  store.due.mockResolvedValue([
    { id, attempts: 0, nextAttemptAt: new Date(dispatchAt.getTime() + 60000) },
  ]);
  await process({ type: 'dispatch' });
  const first = mocks.add.mock.calls[0]?.[2] as { jobId: string };
  const duplicate = mocks.add.mock.calls[1]?.[2] as { jobId: string };
  const recovered = mocks.add.mock.calls[2]?.[2] as { jobId: string };
  expect(first.jobId).toBe(duplicate.jobId);
  expect(recovered.jobId).not.toBe(first.jobId);
  expect(mocks.add.mock.calls.map((call) => call[1])).toEqual(
    Array.from({ length: 3 }, () => ({ type: 'deliver', outboxId: id })),
  );
  await worker.close();
});
it.each([new Error('sensitive provider failure'), new DeliveryError('EXPIRED_MESSAGE')])(
  'SEC: delivery rejection persists only safe error codes',
  async (error) => {
    const worker = await start();
    mocks.deliver.mockRejectedValue(error);
    await expect(process({ type: 'deliver', outboxId: id })).rejects.toThrow(/^JOB_FAILED$/);
    expect(store.failed).toHaveBeenCalledWith(
      { id },
      error instanceof DeliveryError ? 'EXPIRED_MESSAGE' : 'DELIVERY_FAILED',
      expect.any(Date),
    );
    expect(store.sent).not.toHaveBeenCalled();
    await worker.close();
  },
);
it('SEC: invalid queue data and database failures cannot leak into failed job reasons', async () => {
  const worker = await start();
  await expect(
    process({ type: 'deliver', outboxId: 'invalid', email: 'sensitive' }),
  ).rejects.toThrow(/^JOB_FAILED$/);
  store.due.mockRejectedValue(new Error('Database details'));
  await expect(process({ type: 'dispatch' })).rejects.toThrow(/^JOB_FAILED$/);
  await worker.close();
});
it('SEC: queue startup failure closes partially initialized resources', async () => {
  mocks.ready.mockRejectedValue(new Error('Queue secret'));
  await expect(start()).rejects.toThrow(/^QUEUE_START_FAILED$/);
  expect(mocks.workerClose).toHaveBeenCalled();
  expect(mocks.queueClose).toHaveBeenCalled();
  expect(mocks.disconnect).toHaveBeenCalled();
});

it('RENT-004: the claimed billing row reaches its transaction-owning handler', async () => {
  const row = { id, channel: 'internal', eventType: 'resident.billing.period' };
  const billing = { deliver: vi.fn(async () => undefined) };
  store.claim.mockResolvedValue(row);
  const worker = await startWorker(
    store as unknown as OutboxRepository,
    { send: vi.fn() },
    randomBytes(32),
    'redis://localhost:6379',
    logger as unknown as Logger,
    undefined,
    undefined,
    undefined,
    billing,
  );
  await process({ type: 'deliver', outboxId: id });
  expect(billing.deliver).toHaveBeenCalledWith(row);
  expect(store.sent).not.toHaveBeenCalled();
  expect(store.failed).not.toHaveBeenCalled();
  expect(mocks.deliver).not.toHaveBeenCalled();
  await worker.close();
});

it('VISIT-001 / NTF-002: enabled daily follow-up schedules and drains bounded batches without duplicating ordinary delivery', async () => {
  const sweep = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(0);
  const worker = await startWorker(
    store as unknown as OutboxRepository,
    { send: vi.fn() },
    randomBytes(32),
    'redis://localhost:6379',
    logger as unknown as Logger,
    undefined,
    undefined,
    undefined,
    undefined,
    { sweep },
  );
  expect(mocks.scheduler).toHaveBeenCalledWith(
    'visit-follow-up',
    { every: 86400000 },
    expect.objectContaining({ data: { type: 'visit-follow-up' } }),
  );
  await process({ type: 'visit-follow-up' });
  expect(mocks.add).toHaveBeenCalledWith(
    'visit-follow-up',
    { type: 'visit-follow-up' },
    expect.any(Object),
  );
  mocks.add.mockClear();
  await process({ type: 'visit-follow-up' });
  expect(mocks.add).not.toHaveBeenCalled();
  expect(store.claim).not.toHaveBeenCalled();
  expect(sweep).toHaveBeenCalledTimes(2);
  await worker.close();
});
it('VISIT-001: disabled follow-up cannot invoke an unconfigured sweep', async () => {
  const worker = await start();
  expect(mocks.scheduler).not.toHaveBeenCalledWith(
    'visit-follow-up',
    expect.anything(),
    expect.anything(),
  );
  await expect(process({ type: 'visit-follow-up' })).rejects.toThrow('JOB_FAILED');
  await worker.close();
});

it('WAIT-001 / NTF-002: reconciliation has an independent recurring job and drains bounded batches', async () => {
  const sweep = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(0);
  const worker = await startWorker(
    store as unknown as OutboxRepository,
    { send: vi.fn() },
    randomBytes(32),
    'redis://localhost:6379',
    logger as unknown as Logger,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { sweep },
  );
  expect(mocks.scheduler).toHaveBeenCalledWith(
    'waitlist-reconcile',
    { every: 60000 },
    expect.objectContaining({ data: { type: 'waitlist-reconcile' } }),
  );
  await process({ type: 'waitlist-reconcile' });
  expect(mocks.add).toHaveBeenCalledWith(
    'waitlist-reconcile',
    { type: 'waitlist-reconcile' },
    expect.any(Object),
  );
  mocks.add.mockClear();
  await process({ type: 'waitlist-reconcile' });
  expect(mocks.add).not.toHaveBeenCalled();
  expect(store.claim).not.toHaveBeenCalled();
  expect(sweep).toHaveBeenCalledTimes(2);
  await worker.close();
});
it('WAIT-001: an unconfigured reconciliation job cannot dispatch unrelated notices', async () => {
  const worker = await start();
  await expect(process({ type: 'waitlist-reconcile' })).rejects.toThrow('JOB_FAILED');
  expect(store.due).not.toHaveBeenCalled();
  await worker.close();
});
it('RB-002 / NTF-001: overdue rent has an hourly job that drains bounded batches', async () => {
  const sweep = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(3);
  const worker = await startWorker(
    store as unknown as OutboxRepository,
    { send: vi.fn() },
    randomBytes(32),
    'redis://localhost:6379',
    logger as unknown as Logger,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { sweep },
  );
  expect(mocks.scheduler).toHaveBeenCalledWith(
    'rent-overdue',
    { every: 3600000 },
    expect.objectContaining({ data: { type: 'rent-overdue' } }),
  );
  await process({ type: 'rent-overdue' });
  expect(mocks.add).toHaveBeenCalledWith(
    'rent-overdue',
    { type: 'rent-overdue' },
    expect.any(Object),
  );
  mocks.add.mockClear();
  await process({ type: 'rent-overdue' });
  expect(mocks.add).not.toHaveBeenCalled();
  expect(store.claim).not.toHaveBeenCalled();
  expect(sweep).toHaveBeenCalledTimes(2);
  await worker.close();
});
it('RB-002: an unconfigured overdue job fails without dispatching notices', async () => {
  const worker = await start();
  await expect(process({ type: 'rent-overdue' })).rejects.toThrow('JOB_FAILED');
  expect(store.due).not.toHaveBeenCalled();
  await worker.close();
});
