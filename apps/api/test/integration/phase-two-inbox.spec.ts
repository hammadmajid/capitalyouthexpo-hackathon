import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { notifications } from '@hsm/db';
import { inboxPageSchema, inboxReadSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-14T12:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
it('NTF-002 SEC-003: real inbox never discloses another account notice or raw data', async () => {
  const ownId = randomUUID(),
    foreignId = randomUUID();
  await fixture.connection.db.insert(notifications).values(
    [ownId, foreignId].map((id, index) => ({
      id,
      userId: index ? fixture.customerB : fixture.customerA,
      type: 'account.email_verified',
      title: index ? 'Foreign notice' : 'Own notice',
      body: 'Generic account notice',
      data: { privateMetadata: 'Not in the inbox DTO' },
      deepLink: null,
      dedupeKey: id,
      createdAt: fixture.now,
    })),
  );
  const headers = { authorization: `Bearer ${fixture.customerAToken}` };
  const response = await fixture.application.inject({ url: '/v1/me/notifications', headers });
  expect(response.statusCode).toBe(200);
  const inbox = inboxPageSchema.parse(response.json());
  expect(inbox.data.map((row) => row.id)).toEqual([ownId]);
  expect(inbox.unreadCount).toBe(1);
  expect(response.body).not.toContain(foreignId);
  expect(response.body).not.toContain('privateMetadata');
  const mark = await fixture.application.inject({
    method: 'PUT',
    url: `/v1/me/notifications/${ownId}/read`,
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
  });
  expect(mark.statusCode).toBe(200);
  expect(inboxReadSchema.parse(mark.json())).toEqual({
    id: ownId,
    readAt: fixture.now.toISOString(),
  });
  const other = await fixture.application.inject({
    method: 'PUT',
    url: `/v1/me/notifications/${foreignId}/read`,
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
  });
  expect(other.statusCode).toBe(404);
  const refreshed = await fixture.application.inject({ url: '/v1/me/notifications', headers });
  expect(inboxPageSchema.parse(refreshed.json()).unreadCount).toBe(0);
});
