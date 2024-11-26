import { nativeOwnerSetup } from './native-owner-setup.ts';
import { observeNativeUi } from './native-ui-observer.ts';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { nativeCommand as command } from './native-command.ts';
import { NativeCommandFailure } from './native-diagnostics.ts';
import { readNativeStep } from './native-report-reader.ts';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { hash, argon2id } from 'argon2';
import { sessions, users } from '@hsm/db';
import { authStack, managementFixture } from '@hsm/test-support';
const results: { name: string; passed: boolean; diagnostic?: string }[] = [];
async function flow(name: string, variables: Record<string, string> = {}) {
  const args = [
    'test',
    '--debug-output',
    '.native-diagnostics',
    '--test-output-dir',
    '.native-diagnostics',
  ];
  for (const [key, value] of Object.entries(variables)) args.push('-e', key + '=' + value);
  args.push('e2e/' + name + '.yaml');
  // Native tooling can print entered credentials. Never forward its output or publish raw traces.
  const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const diagnostics = resolve(project, '.native-diagnostics');
  if (!diagnostics.startsWith(project + sep)) throw new Error('Invalid diagnostic directory');
  try {
    await command('maestro', args, { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' });
  } catch (error) {
    if (error instanceof NativeCommandFailure) {
      const step = await readNativeStep(diagnostics);
      const ui = await observeNativeUi();
      throw new NativeCommandFailure({ ...error.diagnostic, ...(step ? { step } : {}), ui });
    }
    throw error;
  } finally {
    await rm(diagnostics, { recursive: true, force: true });
  }
}
async function check(name: string, work: () => Promise<void>) {
  try {
    await work();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({
      name,
      passed: false,
      ...(error instanceof NativeCommandFailure ? { diagnostic: error.message } : {}),
    });
    throw new Error(name + ' failed');
  }
}
async function emailCode(mailpit: string, previousId?: string) {
  const schema = z.object({ ID: z.string(), Subject: z.string(), Text: z.string() });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const response = await fetch(mailpit + '/api/v1/message/latest', {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const message = schema.parse(await response.json());
      const code = message.Text.match(/\b\d{6}\b/)?.[0];
      if (message.ID !== previousId && message.Subject === 'Verify your email' && code) return code;
    }
    await delay(200);
  }
  throw new Error('Expected verification email not delivered');
}
async function main() {
  const stack = await authStack();
  try {
    const port = new URL(stack.apiUrl).port;
    await command('adb', ['reverse', 'tcp:4000', 'tcp:' + port]);
    await command('adb', [
      'install',
      '-r',
      'android/app/build/outputs/apk/release/app-release.apk',
    ]);
    const email = randomUUID() + '@example.test';
    const password = randomBytes(18).toString('hex');
    const variables = {
      EMAIL: email,
      PASSWORD: password,
      PHONE: '+923' + randomInt(0, 1000000000).toString().padStart(9, '0'),
    };
    await check('AUTH-C-001: native registration and delivered email', async () => {
      await flow('register', variables);
      await emailCode(stack.mailpitUrl);
      const [identity] = await stack.database.db.select().from(users).where(eq(users.email, email));
      assert(identity);
      assert.equal(identity.passwordHash, null);
      assert.equal(identity.emailVerifiedAt, null);
      assert.equal(
        (await stack.database.db.select().from(sessions).where(eq(sessions.userId, identity.id)))
          .length,
        0,
      );
    });
    await check(
      'AUTH-C-004: native OTP and permanent password establish persisted mobile session',
      async () => {
        await flow('verify', { ...variables, OTP: await emailCode(stack.mailpitUrl) });
        const [identity] = await stack.database.db
          .select()
          .from(users)
          .where(eq(users.email, email));
        assert(identity?.emailVerifiedAt);
        assert(identity.passwordHash);
        const persisted = await stack.database.db
          .select()
          .from(sessions)
          .where(eq(sessions.userId, identity.id));
        assert.equal(persisted.length, 1);
        assert.equal(persisted[0]?.client, 'mobile');
        assert.equal(persisted[0]?.revokedAt, null);
      },
    );
    await check('SEC-001: native restart restores SecureStore session', async () => {
      await flow('restore');
    });
    await check(
      'SEC-001: native logout revokes persisted session and removes restoration',
      async () => {
        await flow('logout');
        const [identity] = await stack.database.db
          .select()
          .from(users)
          .where(eq(users.email, email));
        assert(identity);
        const persisted = await stack.database.db
          .select()
          .from(sessions)
          .where(eq(sessions.userId, identity.id));
        assert(persisted.every((row) => row.revokedAt !== null));
        await flow('logged-out');
      },
    );
    await check('AUTH-C: native login and all-device logout', async () => {
      await flow('login', { EMAIL: email, PASSWORD: password });
      await flow('logout-all');
      const [identity] = await stack.database.db.select().from(users).where(eq(users.email, email));
      assert(identity);
      const persisted = await stack.database.db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, identity.id));
      assert(persisted.length >= 2);
      assert(persisted.every((row) => row.revokedAt !== null));
      await flow('logged-out');
    });
    const temporary = randomBytes(18).toString('hex');
    const activated = randomBytes(18).toString('hex');
    const fixture = await managementFixture(
      stack.database.db,
      await hash(temporary, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }),
      new Date(),
    );
    await check('ACC-002: native manager activation and scoped branch shell', async () => {
      await flow('manager', {
        PHONE: fixture.phone,
        TEMP_PASSWORD: temporary,
        PASSWORD: activated,
      });
    });
    await check(
      'AUTH-M SEC-001: native verified email remains on the activated Manager identity',
      async () => {
        const [before] = await stack.database.db
          .select()
          .from(users)
          .where(eq(users.phoneE164, fixture.phone));
        assert(before);
        assert.equal(before.email, null);
        const existingSessions = await stack.database.db
          .select()
          .from(sessions)
          .where(eq(sessions.userId, before.id));
        const priorResponse = await fetch(stack.mailpitUrl + '/api/v1/message/latest');
        const previousId = priorResponse.ok
          ? z.object({ ID: z.string() }).parse(await priorResponse.json()).ID
          : undefined;
        const associatedEmail = randomUUID() + '@example.test';
        await flow('associate-email', { EMAIL: associatedEmail, PASSWORD: activated });
        await flow('verify-associated-email', {
          OTP: await emailCode(stack.mailpitUrl, previousId),
        });
        const [after] = await stack.database.db.select().from(users).where(eq(users.id, before.id));
        assert(after?.emailVerifiedAt);
        assert.equal(after.email, associatedEmail);
        assert.equal(after.phoneE164, before.phoneE164);
        assert.equal(after.phoneVerifiedAt, null);
        assert.equal(after.passwordHash, before.passwordHash);
        const persisted = await stack.database.db
          .select()
          .from(sessions)
          .where(eq(sessions.userId, before.id));
        assert.equal(persisted.length, existingSessions.length);
        assert.deepEqual(
          persisted.map((row) => row.id).sort(),
          existingSessions.map((row) => row.id).sort(),
        );
      },
    );
    await check(
      'SEC-001: native all-device revocation rejects stored credentials at restart',
      async () => {
        const response = await fetch(stack.apiUrl + '/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            identifier: fixture.phone,
            password: activated,
            client: 'mobile',
          }),
        });
        assert.equal(response.status, 200);
        const token = z
          .object({ accessToken: z.string() })
          .parse(await response.json()).accessToken;
        assert.equal(
          (
            await fetch(stack.apiUrl + '/auth/logout-all', {
              method: 'POST',
              headers: { authorization: 'Bearer ' + token },
            })
          ).status,
          200,
        );
        await flow('revoked');
      },
    );
    await check(
      'ONB-001 CHG-006: native Owner map pin, draft persistence, resume and submission',
      () => nativeOwnerSetup(stack, flow),
    );
    assert.deepEqual(stack.processes(), { api: null, worker: null });
  } finally {
    await stack.close();
  }
}
try {
  await main();
} catch {
  if (!results.some((result) => !result.passed))
    results.push({ name: 'Native infrastructure setup', passed: false });
  throw new Error('Real Android verification failed; see sanitized results');
} finally {
  await mkdir('test-results', { recursive: true });
  const cases = results
    .map(
      (result) =>
        '<testcase name="' +
        result.name +
        '">' +
        (result.passed
          ? ''
          : '<failure message="' + (result.diagnostic ?? 'Native verification failed') + '"/>') +
        '</testcase>',
    )
    .join('');
  await writeFile(
    'test-results/native.xml',
    '<testsuite name="Real Android API integration" tests="' +
      results.length +
      '" failures="' +
      results.filter((result) => !result.passed).length +
      '" skipped="0">' +
      cases +
      '</testsuite>',
  );
}
