import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import { z } from 'zod';
import { notificationOutbox } from '@hsm/db';
import { sealEnvelope } from '@hsm/security/envelope';
import { OutboxRepository } from '../src/repository.js';
import { startWorker } from '../src/runtime.js';
import { smtpProvider } from '../src/smtp.js';
import { workerConfig } from '../src/config.js';
import { workerFixture } from './fixture.js';
let fixture: Awaited<ReturnType<typeof workerFixture>>;
beforeAll(async () => {
  fixture = await workerFixture();
});
afterAll(async () => {
  await fixture?.close();
});
async function message(overrides: Partial<typeof notificationOutbox.$inferInsert> = {}) {
  const [row] = await fixture.database.db
    .insert(notificationOutbox)
    .values({
      eventType: 'auth.otp',
      channel: 'email',
      recipientAddress: 'person@example.test',
      payload: {},
      dedupeKey: randomUUID(),
      nextAttemptAt: new Date(),
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('Outbox fixture missing');
  return row;
}
async function read(id: string) {
  const [row] = await fixture.database.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.id, id));
  if (!row) throw new Error('Outbox row missing');
  return row;
}
it('NTF-002: a future attempt is not claimable until its explicit persisted due time', async () => {
  const now = new Date(),
    nextAttemptAt = new Date(now.getTime() + 60000),
    row = await message({ nextAttemptAt });
  const repository = new OutboxRepository(fixture.database.db);
  expect((await repository.due(now)).map((value) => value.id)).not.toContain(row.id);
  expect(await repository.claim(row.id, now)).toBeUndefined();
  expect(await repository.claim(row.id, nextAttemptAt)).toMatchObject({ id: row.id, attempts: 1 });
});
it('NTF-002: concurrent claims acquire one lease and stale owners cannot acknowledge a recovered attempt', async () => {
  const row = await message();
  const repository = new OutboxRepository(fixture.database.db);
  const now = new Date();
  const claims = await Promise.all(Array.from({ length: 10 }, () => repository.claim(row.id, now)));
  const winners = claims.filter((value) => value !== undefined);
  expect(winners).toHaveLength(1);
  const first = winners[0];
  if (!first) throw new Error('Lease missing');
  expect((await read(row.id)).attempts).toBe(1);
  expect((await repository.due(now)).map((value) => value.id)).not.toContain(row.id);
  const recovered = await repository.claim(row.id, new Date(now.getTime() + 61000));
  if (!recovered) throw new Error('Expired lease not recovered');
  expect(recovered.attempts).toBe(2);
  expect(recovered.leaseToken).not.toBe(first.leaseToken);
  await repository.sent(first, 'stale-provider', now);
  expect((await read(row.id)).status).toBe('pending');
  await repository.sent(recovered, 'accepted-provider', now);
  expect(await read(row.id)).toMatchObject({
    status: 'sent',
    providerMessageId: 'accepted-provider',
    leaseToken: null,
    leaseExpiresAt: null,
  });
  expect(await repository.claim(row.id, now)).toBeUndefined();
});
it('NTF-002: persisted retries become dead after five failures and invalid lease pairs violate constraints', async () => {
  const row = await message();
  const repository = new OutboxRepository(fixture.database.db);
  let now = new Date();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const claimed = await repository.claim(row.id, now);
    if (!claimed) throw new Error('Due attempt missing');
    expect(claimed.attempts).toBe(attempt);
    await repository.failed(claimed, 'DELIVERY_FAILED', now);
    const persisted = await read(row.id);
    expect(persisted.leaseToken).toBeNull();
    expect(persisted.status).toBe(attempt === 5 ? 'dead' : 'failed');
    now = new Date(persisted.nextAttemptAt.getTime() + 1);
  }
  expect(await repository.claim(row.id, now)).toBeUndefined();
  await expect(message({ leaseToken: randomUUID() })).rejects.toThrow();
});
it('AUTH-C-002: real Redis/BullMQ worker delivers encrypted OTP through SMTP to Mailpit', async () => {
  const key = randomBytes(32);
  const code = '482731';
  const config = workerConfig({
    DATABASE_URL: 'postgres://localhost/test',
    REDIS_URL: fixture.redisUrl,
    EMAIL_ENVELOPE_KEY: key.toString('hex'),
    SMTP_HOST: fixture.smtpHost,
    SMTP_PORT: fixture.smtpPort,
    SMTP_FROM: 'no-reply@example.test',
  });
  const provider = smtpProvider(config);
  const repository = new OutboxRepository(fixture.database.db);
  const worker = await startWorker(
    repository,
    provider,
    key,
    fixture.redisUrl,
    pino({ level: 'silent' }),
  );
  try {
    const row = await message({
      payload: {
        envelope: sealEnvelope(
          JSON.stringify({
            email: 'person@example.test',
            code,
            purpose: 'signup_verify',
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          }),
          key,
          'email',
        ).toString('base64'),
      },
    });
    await expect
      .poll(async () => (await read(row.id)).status, { timeout: 20000, interval: 200 })
      .toBe('sent');
    const response = await fetch(fixture.mailpitUrl + '/api/v1/message/latest');
    expect(response.ok).toBe(true);
    const mail = z
      .object({ Subject: z.string(), Text: z.string(), HTML: z.string() })
      .parse(await response.json());
    expect(mail.Subject).toBe('Verify your email');
    expect(mail.Text).toContain(code);
    expect(mail.HTML).toContain(code);
    expect(await read(row.id)).toMatchObject({
      attempts: 1,
      lastError: null,
      providerMessageId: '<' + row.id + '@outbox.hsm.invalid>',
    });
  } finally {
    await worker.close();
    provider.close();
  }
});

it('NTF-002 / RENT-004: failed delivery recovery persists one pending retry lease with retained history', async () => {
  const row = await message({ status: 'failed', attempts: 2, lastError: 'DELIVERY_FAILED' });
  const repository = new OutboxRepository(fixture.database.db);
  const now = new Date();
  const claims = await Promise.all(Array.from({ length: 6 }, () => repository.claim(row.id, now)));
  const winners = claims.filter((value) => value !== undefined);
  expect(winners).toHaveLength(1);
  const claimed = winners[0];
  if (!claimed) throw new Error('Retry lease missing');
  expect(claimed).toMatchObject({
    status: 'pending',
    attempts: 3,
    lastError: 'DELIVERY_FAILED',
    leaseExpiresAt: new Date(now.getTime() + 60000),
  });
  expect(claimed.leaseToken).not.toBeNull();
  expect(await read(row.id)).toMatchObject({
    status: 'pending',
    attempts: 3,
    leaseToken: claimed.leaseToken,
    lastError: 'DELIVERY_FAILED',
  });
  expect(await repository.claim(row.id, now)).toBeUndefined();
});
