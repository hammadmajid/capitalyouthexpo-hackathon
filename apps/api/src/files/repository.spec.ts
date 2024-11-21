import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import type { Database } from '@hsm/db';
import { files, users, sessions, notificationOutbox, sensitiveAccessLog } from '@hsm/db';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { quarantineKey } from '@hsm/files';
import { FileRepository } from './repository.js';
const now = new Date('2026-10-08T12:00:00Z');
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const id = randomUUID();
const row: typeof files.$inferSelect = {
  id,
  uploadedBy: actor.userId,
  visibility: 'private',
  bucket: 'private-test',
  objectKey: quarantineKey('payment_proof', id),
  mimeType: 'application/pdf',
  sizeBytes: 24n,
  sha256: null,
  purpose: 'payment_proof',
  scanStatus: 'pending',
  createdAt: now,
};
function fixture(
  options: {
    missingFile?: boolean;
    missingIdentity?: boolean;
    status?: string;
    missingSession?: boolean;
    revoked?: boolean;
    auditFailure?: boolean;
  } = {},
) {
  const writes: { table: unknown; value: unknown }[] = [],
    predicates: { table: unknown; predicate: SQL }[] = [];
  const updates: unknown[] = [],
    conflict = vi.fn(async () => undefined);
  const database = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        const values =
          table === users
            ? options.missingIdentity
              ? []
              : [{ status: options.status ?? 'active' }]
            : table === sessions
              ? options.missingSession
                ? []
                : [
                    {
                      id: actor.sessionId,
                      revokedAt: options.revoked ? now : null,
                      expiresAt: new Date(now.getTime() + 60000),
                    },
                  ]
              : options.missingFile
                ? []
                : [row];
        return {
          where: vi.fn((predicate: SQL) => {
            predicates.push({ table, predicate });
            return Object.assign(Promise.resolve(values), { for: vi.fn(async () => values) });
          }),
        };
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((value: unknown) => {
        writes.push({ table, value });
        if (table === sensitiveAccessLog && options.auditFailure)
          throw new Error('Audit fixture failure');
        return Object.assign(Promise.resolve(undefined), { onConflictDoNothing: conflict });
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value: unknown) => {
        updates.push(value);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
    transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(database)),
  };
  return {
    database: database as unknown as Database,
    writes,
    predicates,
    updates,
    conflict,
    repository: new FileRepository(
      database as unknown as Database,
      'private-test',
      undefined,
      () => now,
    ),
  };
}
afterEach(() => vi.useRealTimers());
it('SEC-003: metadata, deduplicated outbox work and sensitive audit use the actor-locked transaction', async () => {
  const value = fixture();
  await value.repository.transaction(actor, async (tx) => {
    const record = await tx.read(id);
    expect(record.upload).toMatchObject({
      purpose: 'payment_proof',
      mimeType: 'application/pdf',
      sizeBytes: 24,
    });
    await tx.create(id, row.objectKey, record.upload);
    await tx.queue(record);
    await tx.reject(record);
    await tx.audit(record);
  });
  expect(value.writes).toEqual([
    {
      table: files,
      value: {
        id,
        uploadedBy: actor.userId,
        bucket: 'private-test',
        visibility: 'private',
        objectKey: row.objectKey,
        mimeType: 'application/pdf',
        sizeBytes: 24n,
        purpose: 'payment_proof',
      },
    },
    {
      table: notificationOutbox,
      value: {
        eventType: 'files.scan',
        channel: 'internal',
        recipientUserId: actor.userId,
        payload: { fileId: id },
        dedupeKey: 'files.scan:' + id,
      },
    },
    {
      table: sensitiveAccessLog,
      value: {
        actorUserId: actor.userId,
        subjectUserId: actor.userId,
        resource: 'private_document',
        resourceId: id,
        purpose: 'Self private file download',
        createdAt: now,
      },
    },
  ]);
  expect(value.conflict).toHaveBeenCalledWith({ target: notificationOutbox.dedupeKey });
  expect(value.updates).toEqual([{ scanStatus: 'rejected', sha256: null }]);
  const predicate = value.predicates.find((entry) => entry.table === files)?.predicate;
  if (!predicate) throw new Error('File predicate missing');
  const query = new PgDialect().sqlToQuery(predicate);
  expect(query.params).toEqual([id, actor.userId, 'private-test', 'private']);
  expect(query.sql).toContain('"uploaded_by"');
});
it('SEC-003: absent or inaccessible files return an opaque 404', async () => {
  const value = fixture({ missingFile: true });
  await expect(value.repository.transaction(actor, (tx) => tx.read(id))).rejects.toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
  });
  expect(value.writes).toEqual([]);
});
it.each([
  { missingIdentity: true },
  { status: 'suspended' },
  { missingSession: true },
  { revoked: true },
])('SEC-003: a dead identity or session cannot enter file work', async (options) => {
  const value = fixture(options),
    work = vi.fn();
  await expect(value.repository.transaction(actor, work)).rejects.toThrow();
  expect(work).not.toHaveBeenCalled();
});
it('SEC-003: sensitive audit failure propagates so the real transaction cannot commit', async () => {
  const value = fixture({ auditFailure: true });
  await expect(
    value.repository.transaction(actor, async (tx) => tx.audit(await tx.read(id))),
  ).rejects.toThrow('Audit fixture failure');
});
it('SEC-003: the default repository clock runs after live actor lookup', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const value = fixture();
  const repository = new FileRepository(value.database, 'private-test');
  await repository.transaction(actor, async (tx) => tx.audit(await tx.read(id)));
  expect(value.writes[0]?.value).toMatchObject({ createdAt: now });
});
