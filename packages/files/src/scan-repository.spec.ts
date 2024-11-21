import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { files, notificationOutbox, type Database } from '@hsm/db';
import { FileScanRepository, scanFile } from './scan-repository.js';
import { quarantineKey, verifiedKey } from './keys.js';
const now = new Date('2026-10-08T12:00:00Z'),
  id = randomUUID(),
  user = randomUUID();
const file: typeof files.$inferSelect = {
  id,
  uploadedBy: user,
  visibility: 'private',
  bucket: 'test-private',
  objectKey: quarantineKey('payment_proof', id),
  mimeType: 'application/pdf',
  sizeBytes: 24n,
  sha256: null,
  purpose: 'payment_proof',
  scanStatus: 'pending',
  createdAt: now,
};
const job: typeof notificationOutbox.$inferSelect = {
  id: randomUUID(),
  eventType: 'files.scan',
  channel: 'internal',
  recipientUserId: user,
  recipientAddress: null,
  payload: { fileId: id },
  dedupeKey: randomUUID(),
  status: 'pending',
  attempts: 1,
  nextAttemptAt: now,
  lastError: null,
  providerMessageId: null,
  createdAt: now,
  sentAt: null,
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
type Change = {
  fileMissing?: boolean;
  jobMissing?: boolean;
  jobChange?: Partial<typeof notificationOutbox.$inferSelect>;
  fileChange?: Partial<typeof files.$inferSelect>;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
});
const snapshot = scanFile(file);
const result = {
  status: 'clean' as const,
  objectKey: verifiedKey('payment_proof', id),
  sha256: Buffer.alloc(32),
};
function fixture(...rows: unknown[][]) {
  const predicates: SQL[] = [];
  const set = vi.fn((value: unknown) => ({ where: vi.fn(async () => value) }));
  const fake = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn((predicate: SQL) => {
          predicates.push(predicate);
          const values = rows.shift() ?? [];
          return Object.assign(Promise.resolve(values), { for: vi.fn(async () => values) });
        }),
      })),
    })),
    update: vi.fn(() => ({ set })),
    transaction: vi.fn(async (work: (database: Database) => Promise<unknown>) =>
      work(fake as unknown as Database),
    ),
  };
  return {
    repository: new FileScanRepository(fake as unknown as Database, 'test-private'),
    set,
    predicates,
  };
}
it('SEC-003: scan lookups filter private bucket and map only validated upload metadata', async () => {
  const value = fixture([file]);
  expect(await value.repository.read(id)).toEqual(snapshot);
  const predicate = value.predicates[0];
  if (!predicate) throw new Error('Missing predicate');
  const query = new PgDialect().sqlToQuery(predicate);
  expect(query.sql).toContain('"bucket"');
  expect(query.sql).toContain('"visibility"');
  expect(query.params).toEqual([id, 'test-private', 'private']);
  expect(await fixture([]).repository.read(id)).toBeUndefined();
  expect(() => scanFile({ ...file, mimeType: 'application/executable' })).toThrow();
});
it('SEC-003: clean publication and lease acknowledgement use the same transaction', async () => {
  const value = fixture([file], [job]);
  expect(await value.repository.complete(job, snapshot, result, now)).toBe(true);
  expect(value.set.mock.calls.map((call) => call[0])).toEqual([
    { scanStatus: 'clean', objectKey: result.objectKey, sha256: result.sha256 },
    {
      status: 'sent',
      sentAt: now,
      providerMessageId: 'files.scan',
      lastError: null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  ]);
  const rejected = fixture([file], [job]);
  await rejected.repository.complete(job, snapshot, { status: 'rejected' }, now);
  expect(rejected.set.mock.calls[0]?.[0]).toEqual({ scanStatus: 'rejected', sha256: null });
});
it('SEC-003: terminal redelivery acknowledges only the current job without modifying the file', async () => {
  const value = fixture([{ ...file, scanStatus: 'clean' }], [job]);
  expect(await value.repository.complete(job, snapshot, undefined, now)).toBe(false);
  expect(value.set).toHaveBeenCalledOnce();
  expect(value.set.mock.calls[0]?.[0]).toMatchObject({ status: 'sent' });
});
it.each<Change>([
  { fileMissing: true },
  { jobMissing: true },
  { jobChange: { leaseToken: randomUUID() } },
  { jobChange: { leaseExpiresAt: null } },
  { jobChange: { leaseExpiresAt: now } },
  { jobChange: { status: 'sent' as const } },
  { jobChange: { status: 'dead' as const } },
])('SEC-003: absent, expired or superseded leases cannot publish', async (change) => {
  const value = fixture(
    change.fileMissing ? [] : [file],
    change.jobMissing ? [] : [{ ...job, ...change.jobChange }],
  );
  expect(await value.repository.complete(job, snapshot, result, now)).toBe(false);
  expect(value.set).not.toHaveBeenCalled();
});
it.each<Change>([
  { jobChange: { payload: { fileId: randomUUID() } } },
  { jobChange: { payload: { fileId: id, extra: true } } },
  { jobChange: { channel: 'email' as const } },
  { jobChange: { eventType: 'auth.otp' } },
  { jobChange: { recipientUserId: randomUUID() } },
  { fileChange: { uploadedBy: randomUUID() } },
  { fileChange: { bucket: 'foreign' } },
  { fileChange: { visibility: 'public' as const } },
])('SEC-003: forged job/file relationships cannot change either row', async (change) => {
  const value = fixture([{ ...file, ...change.fileChange }], [{ ...job, ...change.jobChange }]);
  await expect(value.repository.complete(job, snapshot, result, now)).rejects.toThrow(
    'INVALID_MESSAGE',
  );
  expect(value.set).not.toHaveBeenCalled();
});
it.each<Partial<typeof files.$inferSelect>>([
  { objectKey: verifiedKey('payment_proof', id) },
  { mimeType: 'image/png' },
  { sizeBytes: 25n },
  { purpose: 'resident_document' as const },
])(
  'SEC-003: a changed pending snapshot cannot publish an earlier validation result',
  async (change) => {
    const value = fixture([{ ...file, ...change }], [job]);
    expect(await value.repository.complete(job, snapshot, result, now)).toBe(false);
    expect(value.set).not.toHaveBeenCalled();
  },
);
it('SEC-003: a pending file cannot be acknowledged without a verdict', async () => {
  const value = fixture([file], [job]);
  expect(await value.repository.complete(job, snapshot, undefined, now)).toBe(false);
  expect(value.set).not.toHaveBeenCalled();
});

it('SEC-003: a lease that expires during lock acquisition cannot publish with an earlier timestamp', async () => {
  const value = fixture([file], [job]);
  vi.setSystemTime(new Date(now.getTime() + 60001));
  expect(await value.repository.complete(job, snapshot, result, now)).toBe(false);
  expect(value.set).not.toHaveBeenCalled();
});
