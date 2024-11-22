import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { sessions, users } from '@hsm/db';
import {
  registrationVerificationResultSchema,
  selfProfileSchema,
  uploadResponseSchema,
  fileStatusResponseSchema,
  downloadResponseSchema,
} from '@hsm/contracts';
import { containerizedStack } from '@hsm/test-support';
let stack: Awaited<ReturnType<typeof containerizedStack>>;
let bearer: string;
const email = randomUUID() + '@example.test';
const password = randomBytes(24).toString('hex');
beforeAll(async () => {
  stack = await containerizedStack(process.env.HSM_CI_IMAGE ?? 'hsm-phase1-ci:local');
});
afterAll(async () => {
  await stack?.close();
});
async function post(path: string, body: unknown) {
  return fetch(stack.apiUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}
it('SEC: API, worker and web execute their production entries as container PID 1', async () => {
  assert.equal(new Set(Object.values(stack.applications).map((item) => item.getId())).size, 3);
  for (const key of ['api', 'worker', 'web'] as const) {
    const result = await stack.applications[key].exec([
      '/usr/local/bin/node',
      'apps/api/test/containers/process-proof.mjs',
      key,
    ]);
    const reason = /OCI runtime exec failed/.test(result.output)
      ? 'runtime_exec'
      : /SyntaxError/.test(result.output)
        ? 'script_syntax'
        : /EACCES|permission denied/i.test(result.output)
          ? 'permission'
          : /ENOENT|not found/i.test(result.output)
            ? 'missing_executable_or_file'
            : 'unclassified';
    assert.equal(result.exitCode, 0, key + ' container PID proof failed: ' + reason);
  }
  assert.equal((await fetch(stack.apiUrl + '/health/ready')).status, 200);
  assert.equal((await fetch(stack.webOrigin + '/login')).status, 200);
  assert.equal((await fetch(stack.webOrigin + '/api/v1/me')).status, 401);
});
it('AUTH-C CHG-006: container API and worker deliver OTP; only permanent password creates a persisted session', async () => {
  assert.equal((await post('/auth/registration/start', { email })).status, 202);
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(stack.mailpitUrl + '/api/v1/message/latest');
        if (!response.ok) return false;
        const message = z
          .object({ Subject: z.string(), Text: z.string() })
          .parse(await response.json());
        code =
          message.Subject === 'Verify your email'
            ? message.Text.match(/\b\d{6}\b/)?.[0]
            : undefined;
        return Boolean(code);
      },
      { timeout: 20000, interval: 200 },
    )
    .toBe(true);
  const [identity] = await stack.database.db.select().from(users).where(eq(users.email, email));
  assert(identity);
  assert.equal(identity.passwordHash, null);
  assert.equal(
    (await stack.database.db.select().from(sessions).where(eq(sessions.userId, identity.id)))
      .length,
    0,
  );
  const verified = await post('/auth/registration/verify', { email, code });
  assert.equal(verified.status, 200);
  const setup = registrationVerificationResultSchema.parse(await verified.json());
  assert.equal(setup.next, 'password');
  if (setup.next !== 'password') throw new Error('Expected password setup');
  assert.equal(
    (await stack.database.db.select().from(sessions).where(eq(sessions.userId, identity.id)))
      .length,
    0,
  );
  const completed = await post('/auth/registration/password', {
    setupToken: setup.setupToken,
    password,
    client: 'mobile',
  });
  assert.equal(completed.status, 200);
  const credential = z.object({ accessToken: z.string() }).parse(await completed.json());
  bearer = credential.accessToken;
  const response = await fetch(stack.apiUrl + '/me', {
    headers: { authorization: 'Bearer ' + credential.accessToken },
  });
  assert.equal(response.status, 200);
  const profile = selfProfileSchema.parse(await response.json());
  assert.equal(profile.user.emailVerified, true);
  assert.equal(profile.capabilities.customer, false);
  assert.equal(profile.capabilities.owner, false);
  const persisted = await stack.database.db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, identity.id));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.revokedAt, null);
  assert.equal(
    (
      await post('/auth/registration/password', {
        setupToken: setup.setupToken,
        password,
        client: 'mobile',
      })
    ).status,
    401,
  );
});
it('SEC-003: container worker scans actual private storage and publishes only a clean immutable download', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\nprivate container document\n');
  const headers = { authorization: 'Bearer ' + bearer, 'content-type': 'application/json' };
  const response = await fetch(stack.apiUrl + '/files/uploads', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: 'payment_proof',
      fileName: 'document.pdf',
      mimeType: 'application/pdf',
      sizeBytes: bytes.length,
    }),
  });
  assert.equal(response.status, 201);
  const upload = uploadResponseSchema.parse(await response.json());
  assert.equal(
    (await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: bytes })).status,
    200,
  );
  const unsigned = new URL(upload.uploadUrl);
  unsigned.search = '';
  assert.equal((await fetch(unsigned)).status, 403);
  assert.equal(
    (await fetch(stack.apiUrl + '/files/' + upload.fileId + '/download', { headers })).status,
    409,
  );
  assert.equal(
    (
      await fetch(stack.apiUrl + '/files/' + upload.fileId + '/complete', {
        method: 'POST',
        headers,
        body: '{}',
      })
    ).status,
    202,
  );
  await expect
    .poll(
      async () => {
        const status = await fetch(stack.apiUrl + '/files/' + upload.fileId, { headers });
        assert.equal(status.status, 200);
        return fileStatusResponseSchema.parse(await status.json()).scanStatus;
      },
      { timeout: 20000, interval: 200 },
    )
    .toBe('clean');
  const download = await fetch(stack.apiUrl + '/files/' + upload.fileId + '/download', { headers });
  assert.equal(download.status, 200);
  const signed = downloadResponseSchema.parse(await download.json());
  assert.equal(
    Buffer.from(await (await fetch(signed.url)).arrayBuffer()).equals(Buffer.from(bytes)),
    true,
  );
});
it('SEC-001: container web BFF forwards secure session cookies and enforces CSRF and logout revocation', async () => {
  const response = await fetch(stack.webOrigin + '/api/v1/auth/login', {
    method: 'POST',
    headers: { origin: stack.webOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: email, password, client: 'web' }),
  });
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie().map((value) => value.split(';')[0] ?? '');
  assert.equal(
    cookies.some((value) => value.startsWith('hsm_access=')),
    true,
  );
  const csrf = cookies.find((value) => value.startsWith('hsm_csrf='))?.slice('hsm_csrf='.length);
  assert(csrf);
  const headers = { cookie: cookies.join('; '), origin: stack.webOrigin };
  assert.equal((await fetch(stack.webOrigin + '/api/v1/me', { headers })).status, 200);
  assert.equal(
    (await fetch(stack.webOrigin + '/api/v1/auth/logout', { method: 'POST', headers })).status,
    403,
  );
  assert.equal(
    (
      await fetch(stack.webOrigin + '/api/v1/auth/logout', {
        method: 'POST',
        headers: { ...headers, 'x-csrf-token': csrf },
      })
    ).status,
    200,
  );
  assert.equal((await fetch(stack.webOrigin + '/api/v1/me', { headers })).status, 401);
});
