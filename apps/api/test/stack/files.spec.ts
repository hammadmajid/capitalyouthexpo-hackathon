import { randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { users, files, notificationOutbox, sensitiveAccessLog } from '@hsm/db';
import {
  uploadResponseSchema,
  fileStatusResponseSchema,
  downloadResponseSchema,
} from '@hsm/contracts';
import { hashPassword } from '../../src/auth/crypto.js';
import { authStack } from './fixture.js';
let stack: Awaited<ReturnType<typeof authStack>>;
let owner: { id: string; token: string }, foreign: { id: string; token: string };
const bytes = Buffer.from('%PDF-1.7\nprivate integration document\n');
const password = 'Private document integration password phrase';
async function request(path: string, token?: string, body?: unknown) {
  return fetch(stack.apiUrl + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
}
async function identity(hash: string) {
  const id = randomUUID(),
    email = id + '@example.test';
  await stack.database.db.insert(users).values({
    id,
    email,
    fullName: 'Private document fixture',
    emailVerifiedAt: new Date(),
    passwordHash: hash,
  });
  const response = await request('/auth/login', undefined, {
    identifier: email,
    password,
    client: 'mobile',
  });
  expect(response.status).toBe(200);
  return {
    id,
    token: z.object({ accessToken: z.string() }).parse(await response.json()).accessToken,
  };
}
beforeAll(async () => {
  stack = await authStack();
  const hash = await hashPassword(password);
  owner = await identity(hash);
  foreign = await identity(hash);
});
afterAll(async () => {
  await stack?.close();
});
async function upload(
  content = bytes,
  mimeType = 'application/pdf',
  purpose = 'payment_proof',
  suffix = 'pdf',
) {
  const response = await request('/files/uploads', owner.token, {
    purpose,
    fileName: 'document.' + suffix,
    mimeType,
    sizeBytes: content.length,
  });
  expect(response.status).toBe(201);
  const value = uploadResponseSchema.parse(await response.json());
  const put = await fetch(value.uploadUrl, {
    method: 'PUT',
    headers: value.headers,
    body: new Uint8Array(content),
  });
  expect(put.status).toBe(200);
  return value;
}
async function verdict(id: string, expected: 'clean' | 'rejected') {
  await expect
    .poll(
      async () => {
        const response = await request('/files/' + id, owner.token);
        expect(response.status).toBe(200);
        return fileStatusResponseSchema.parse(await response.json()).scanStatus;
      },
      { timeout: 20000, interval: 200 },
    )
    .toBe(expected);
}
async function cleanFile() {
  const value = await upload();
  expect((await request('/files/' + value.fileId + '/complete', owner.token, {})).status).toBe(202);
  await verdict(value.fileId, 'clean');
  return value;
}
it('SEC-003: production API and worker validate, scan, atomically publish and audit an immutable private download', async () => {
  const value = await upload();
  expect((await request('/files/' + value.fileId + '/download', owner.token)).status).toBe(409);
  const completions = await Promise.all(
    [1, 2, 3].map(() => request('/files/' + value.fileId + '/complete', owner.token, {})),
  );
  expect(completions.map((response) => response.status)).toEqual([202, 202, 202]);
  await verdict(value.fileId, 'clean');
  const [file] = await stack.database.db.select().from(files).where(eq(files.id, value.fileId));
  expect(file?.scanStatus).toBe('clean');
  expect(file?.objectKey.startsWith('private/payment_proof/' + value.fileId + '/')).toBe(true);
  expect(file?.sha256?.equals(createHash('sha256').update(bytes).digest())).toBe(true);
  const jobs = await stack.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, 'files.scan:' + value.fileId));
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.status).toBe('sent');
  const response = await request('/files/' + value.fileId + '/download', owner.token);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const signed = downloadResponseSchema.parse(await response.json());
  expect(new URL(signed.url).searchParams.get('X-Amz-Expires')).toBe('60');
  expect(Buffer.from(await (await fetch(signed.url)).arrayBuffer()).equals(bytes)).toBe(true);
  const audits = await stack.database.db
    .select()
    .from(sensitiveAccessLog)
    .where(eq(sensitiveAccessLog.resourceId, value.fileId));
  expect(audits).toHaveLength(1);
  expect(audits[0]?.actorUserId).toBe(owner.id);
  const replacement = Buffer.alloc(bytes.length, 65);
  expect(
    (
      await fetch(value.uploadUrl, {
        method: 'PUT',
        headers: value.headers,
        body: new Uint8Array(replacement),
      })
    ).status,
  ).toBe(200);
  expect(Buffer.from(await (await fetch(signed.url)).arrayBuffer()).equals(bytes)).toBe(true);
  const unsigned = new URL(value.uploadUrl);
  unsigned.search = '';
  expect((await fetch(unsigned)).status).toBe(403);
  expect(stack.processes()).toEqual({ api: null, worker: null });
});
it('SEC-001/003: foreign and anonymous requests cannot discover, complete or download another uploader file', async () => {
  const value = await upload();
  for (const path of ['/files/' + value.fileId, '/files/' + value.fileId + '/download']) {
    expect((await request(path, foreign.token)).status).toBe(404);
    expect((await request(path)).status).toBe(401);
  }
  expect((await request('/files/' + value.fileId + '/complete', foreign.token, {})).status).toBe(
    404,
  );
  expect((await request('/files/invalid', owner.token)).status).toBe(400);
  expect(
    await stack.database.db
      .select()
      .from(sensitiveAccessLog)
      .where(eq(sensitiveAccessLog.resourceId, value.fileId)),
  ).toEqual([]);
});
it('SEC-003: real content violations persist rejection, while a missing object remains retryable without scan work', async () => {
  const invalid = await upload(Buffer.alloc(bytes.length, 65));
  expect((await request('/files/' + invalid.fileId + '/complete', owner.token, {})).status).toBe(
    400,
  );
  await verdict(invalid.fileId, 'rejected');
  const tooLarge = await upload();
  const [row] = await stack.database.db.select().from(files).where(eq(files.id, tooLarge.fileId));
  if (!row) throw new Error('Upload metadata missing');
  await stack.storage.client.send(
    new PutObjectCommand({
      Bucket: stack.storage.bucket,
      Key: row.objectKey,
      ACL: 'private',
      ContentType: 'application/pdf',
      Body: Buffer.concat([bytes, bytes]),
    }),
  );
  expect((await request('/files/' + tooLarge.fileId + '/complete', owner.token, {})).status).toBe(
    400,
  );
  await verdict(tooLarge.fileId, 'rejected');
  const response = await request('/files/uploads', owner.token, {
    purpose: 'payment_proof',
    fileName: 'absent.pdf',
    mimeType: 'application/pdf',
    sizeBytes: bytes.length,
  });
  expect(response.status).toBe(201);
  const absent = uploadResponseSchema.parse(await response.json());
  expect((await request('/files/' + absent.fileId + '/complete', owner.token, {})).status).toBe(
    503,
  );
  const state = await request('/files/' + absent.fileId, owner.token);
  expect(fileStatusResponseSchema.parse(await state.json()).scanStatus).toBe('pending');
  for (const id of [invalid.fileId, tooLarge.fileId, absent.fileId])
    expect(
      await stack.database.db
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.dedupeKey, 'files.scan:' + id)),
    ).toEqual([]);
});
it('SEC-003: the actual ClamAV worker rejects infected content and never publishes a download', async () => {
  // Standard harmless antivirus test signature; this exercises the real scanner.
  const infected = Buffer.from(
    // eslint-disable-next-line no-secrets/no-secrets -- Public benign EICAR test signature, not a credential.
    'WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=',
    'base64',
  );
  const value = await upload(infected, 'text/csv', 'import', 'csv');
  expect((await request('/files/' + value.fileId + '/complete', owner.token, {})).status).toBe(202);
  await verdict(value.fileId, 'rejected');
  expect((await request('/files/' + value.fileId + '/download', owner.token)).status).toBe(409);
  const [row] = await stack.database.db.select().from(files).where(eq(files.id, value.fileId));
  expect(row?.sha256).toBeNull();
  expect(row?.objectKey.startsWith('quarantine/')).toBe(true);
});
it('SEC-003: a real audit write failure rolls back and cannot return a signed download', async () => {
  const value = await cleanFile();
  await stack.database.db
    .execute(sql`CREATE FUNCTION fail_file_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$`);
  await stack.database.db
    .execute(sql`CREATE TRIGGER fail_file_audit BEFORE INSERT ON sensitive_access_log
    FOR EACH ROW EXECUTE FUNCTION fail_file_audit()`);
  try {
    const response = await request('/files/' + value.fileId + '/download', owner.token);
    expect(response.status).toBe(500);
    const problem = z
      .object({ code: z.literal('INTERNAL'), detail: z.string() })
      .parse(await response.json());
    expect(problem.detail).not.toContain('fixture audit failure');
    expect(
      await stack.database.db
        .select()
        .from(sensitiveAccessLog)
        .where(eq(sensitiveAccessLog.resourceId, value.fileId)),
    ).toEqual([]);
  } finally {
    await stack.database.db.execute(sql`DROP TRIGGER fail_file_audit ON sensitive_access_log`);
    await stack.database.db.execute(sql`DROP FUNCTION fail_file_audit()`);
  }
  expect((await request('/files/' + value.fileId + '/download', owner.token)).status).toBe(200);
});
it('SEC-001/003: persisted account suspension and logout immediately deny file work with an existing token', async () => {
  const value = await upload();
  await stack.database.db
    .update(users)
    .set({ accountStatus: 'suspended' })
    .where(eq(users.id, owner.id));
  expect((await request('/files/' + value.fileId, owner.token)).status).toBe(403);
  await stack.database.db
    .update(users)
    .set({ accountStatus: 'active' })
    .where(eq(users.id, owner.id));
  expect((await request('/auth/logout', owner.token, {})).status).toBe(200);
  expect((await request('/files/' + value.fileId, owner.token)).status).toBe(401);
  expect(
    await stack.database.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.recipientUserId, owner.id),
          eq(notificationOutbox.dedupeKey, 'files.scan:' + value.fileId),
        ),
      ),
  ).toEqual([]);
});
