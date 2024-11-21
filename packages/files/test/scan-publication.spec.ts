import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { files, notificationOutbox } from '@hsm/db';
import { scanFile, quarantineKey } from '../src/index.js';
import { scanFixture } from './scan-fixture.js';
let fixture: Awaited<ReturnType<typeof scanFixture>>;
beforeAll(async () => {
  fixture = await scanFixture();
}, 300000);
afterAll(async () => {
  await fixture?.close();
});
function signal() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: () => resolve() };
}
const clean = Buffer.from('%PDF-1.7\nprivate snapshot\n');
async function pending(
  bytes: Buffer = clean,
  purpose: 'payment_proof' | 'import' = 'payment_proof',
) {
  const id = randomUUID(),
    key = quarantineKey(purpose, id);
  const upload = {
    purpose,
    fileName: purpose === 'import' ? 'fixture.csv' : 'fixture.pdf',
    mimeType: purpose === 'import' ? ('text/csv' as const) : ('application/pdf' as const),
    sizeBytes: bytes.length,
  };
  const url = await fixture.storage.presignUpload(key, upload);
  expect(
    (
      await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': upload.mimeType },
        body: Uint8Array.from(bytes),
      })
    ).ok,
  ).toBe(true);
  await fixture.database.db.insert(files).values({
    id,
    uploadedBy: fixture.userId,
    visibility: 'private',
    bucket: fixture.bucket,
    objectKey: key,
    mimeType: upload.mimeType,
    sizeBytes: BigInt(bytes.length),
    purpose,
  });
  const [job] = await fixture.database.db
    .insert(notificationOutbox)
    .values({
      eventType: 'files.scan',
      channel: 'internal',
      recipientUserId: fixture.userId,
      payload: { fileId: id },
      dedupeKey: 'scan:' + id,
      attempts: 1,
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60000),
    })
    .returning();
  if (!job) throw new Error('Scan lease missing');
  return { id, key, job, url, upload };
}
async function stored(id: string) {
  const [row] = await fixture.database.db.select().from(files).where(eq(files.id, id));
  if (!row) throw new Error('File row missing');
  return row;
}
async function outbox(id: string) {
  const [row] = await fixture.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, id));
  if (!row) throw new Error('Outbox row missing');
  return row;
}
it('SEC-003: real validation and antivirus publish an immutable private snapshot and acknowledge atomically', async () => {
  const value = await pending();
  await fixture.service.deliver(value.job);
  const row = await stored(value.id);
  expect(row.scanStatus).toBe('clean');
  expect(row.sha256).toHaveLength(32);
  expect(row.objectKey.startsWith('private/payment_proof/' + value.id + '/')).toBe(true);
  expect(await outbox(value.job.id)).toMatchObject({
    status: 'sent',
    leaseToken: null,
    leaseExpiresAt: null,
  });
  const download = await fixture.storage.presignDownload(row.objectKey, value.id, row.mimeType);
  expect(Buffer.from(await (await fetch(download)).arrayBuffer()).equals(clean)).toBe(true);
  expect(
    (
      await fetch(value.url, {
        method: 'PUT',
        headers: { 'content-type': value.upload.mimeType },
        body: Buffer.alloc(clean.length, 65),
      })
    ).ok,
  ).toBe(true);
  expect((await fixture.storage.read(row.objectKey, clean.length)).equals(clean)).toBe(true);
  await fixture.service.deliver(value.job);
  expect((await fixture.storage.read(row.objectKey, clean.length)).equals(clean)).toBe(true);
});
it('SEC-003: an actual antivirus verdict rejects infected content and never creates a clean digest', async () => {
  const signature = Buffer.from(
    // eslint-disable-next-line no-secrets/no-secrets -- Public benign EICAR antivirus test signature, not a credential.
    'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=',
    'base64',
  );
  const value = await pending(signature, 'import');
  await fixture.service.deliver(value.job);
  expect(await stored(value.id)).toMatchObject({
    scanStatus: 'rejected',
    sha256: null,
    objectKey: value.key,
  });
  expect((await outbox(value.job.id)).status).toBe('sent');
});
it('SEC-003: superseded and database-expired leases cannot publish or erase the current upload', async () => {
  const value = await pending(),
    replacement = randomUUID();
  await fixture.database.db
    .update(notificationOutbox)
    .set({ leaseToken: replacement, attempts: 2 })
    .where(eq(notificationOutbox.id, value.job.id));
  await fixture.service.deliver(value.job);
  expect((await stored(value.id)).scanStatus).toBe('pending');
  expect((await fixture.storage.read(value.key, clean.length)).equals(clean)).toBe(true);
  expect(await outbox(value.job.id)).toMatchObject({ status: 'pending', leaseToken: replacement });
  const current = await outbox(value.job.id);
  await fixture.service.deliver(current);
  expect((await stored(value.id)).scanStatus).toBe('clean');
  const expired = await pending();
  await fixture.database.db
    .update(notificationOutbox)
    .set({ leaseExpiresAt: new Date(Date.now() - 1) })
    .where(eq(notificationOutbox.id, expired.job.id));
  await fixture.service.deliver(expired.job);
  expect((await stored(expired.id)).scanStatus).toBe('pending');
  expect((await fixture.storage.read(expired.key, clean.length)).equals(clean)).toBe(true);
  expect((await outbox(expired.job.id)).status).toBe('pending');
});
it('SEC-003: a real acknowledgement failure rolls back clean metadata and preserves the lease', async () => {
  const value = await pending();
  await fixture.database.db.execute(
    sql`CREATE FUNCTION test_reject_scan_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture acknowledgement rejected'; END $$`,
  );
  await fixture.database.db.execute(
    sql`CREATE TRIGGER test_reject_scan_ack BEFORE UPDATE ON notification_outbox FOR EACH ROW WHEN (NEW.status = 'sent') EXECUTE FUNCTION test_reject_scan_ack()`,
  );
  try {
    await expect(fixture.service.deliver(value.job)).rejects.toThrow();
    expect(await stored(value.id)).toMatchObject({
      scanStatus: 'pending',
      sha256: null,
      objectKey: value.key,
    });
    expect(await outbox(value.job.id)).toMatchObject({
      status: 'pending',
      leaseToken: value.job.leaseToken,
    });
  } finally {
    await fixture.database.db.execute(
      sql`DROP TRIGGER test_reject_scan_ack ON notification_outbox`,
    );
    await fixture.database.db.execute(sql`DROP FUNCTION test_reject_scan_ack()`);
  }
});

it('SEC-003: real row-lock contention cannot publish after the persisted lease expires', async () => {
  const value = await pending();
  const snapshot = scanFile(await stored(value.id));
  const locked = signal();
  const release = signal();
  const blocker = fixture.database.db.transaction(async (transaction) => {
    await transaction.select().from(files).where(eq(files.id, value.id)).for('update');
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  const expiresAt = new Date(Date.now() + 5000);
  let publication: Promise<boolean> | undefined;
  try {
    await fixture.database.db
      .update(notificationOutbox)
      .set({ leaseExpiresAt: expiresAt })
      .where(eq(notificationOutbox.id, value.job.id));
    const requestedAt = new Date();
    expect(requestedAt < expiresAt).toBe(true);
    publication = fixture.repository.complete(
      value.job,
      snapshot,
      { status: 'rejected' },
      requestedAt,
    );
    await delay(Math.max(0, expiresAt.getTime() - Date.now()) + 100);
  } finally {
    release.resolve();
    await blocker;
  }
  expect(await publication).toBe(false);
  expect(await stored(value.id)).toMatchObject({ scanStatus: 'pending', sha256: null });
  expect(await outbox(value.job.id)).toMatchObject({
    status: 'pending',
    leaseToken: value.job.leaseToken,
  });
});
