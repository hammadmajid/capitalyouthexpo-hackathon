import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { chatMessages, conversations, reports } from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function source() {
  const scope = await harness.scope(),
    conversationId = randomUUID(),
    messageId = randomUUID();
  await harness
    .database()
    .insert(conversations)
    .values({ id: conversationId, branchId: scope.branchId, customerUserId: scope.customerA });
  await harness.database().insert(chatMessages).values({
    id: messageId,
    conversationId,
    senderUserId: scope.customerA,
    senderSide: 'customer',
    body: 'Retained safety evidence',
  });
  return { ...scope, conversationId, messageId };
}
it('COMM-002 / ACC-006: chat reports must reference existing immutable message evidence', async () => {
  const item = await source(),
    db = harness.database(),
    input = {
      reporterUserId: item.customerA,
      targetType: 'chat_message',
      targetId: item.messageId,
      reason: 'harassment',
    };
  await expect(db.insert(reports).values({ ...input, targetId: randomUUID() })).rejects.toThrow();
  const [row] = await db
    .insert(reports)
    .values({ ...input, details: 'Specific incident evidence' })
    .returning();
  if (!row) throw new Error('Missing report');
  for (const patch of [
    { details: 'Rewritten evidence' },
    { targetId: randomUUID() },
    { reporterUserId: item.customerB },
    { createdAt: new Date(0) },
  ]) {
    await expect(db.update(reports).set(patch).where(eq(reports.id, row.id))).rejects.toThrow();
  }
  await db.update(reports).set({ status: 'investigating' }).where(eq(reports.id, row.id));
  await db
    .update(chatMessages)
    .set({ deletedAt: new Date() })
    .where(eq(chatMessages.id, item.messageId));
  const [retained] = await db.select().from(reports).where(eq(reports.id, row.id));
  expect(retained).toMatchObject({
    status: 'investigating',
    targetId: item.messageId,
    details: 'Specific incident evidence',
  });
});
it('COMM-002 / AUD-002: referenced report history cannot be removed and resolution requires attributed evidence', async () => {
  const item = await source(),
    db = harness.database();
  const [row] = await db
    .insert(reports)
    .values({
      reporterUserId: item.customerA,
      targetType: 'chat_message',
      targetId: item.messageId,
      reason: 'unsafe',
    })
    .returning();
  if (!row) throw new Error('Missing report');
  await expect(db.delete(reports).where(eq(reports.id, row.id))).rejects.toThrow();
  await expect(db.execute(sql`TRUNCATE reports`)).rejects.toThrow();
  await expect(
    db.update(reports).set({ status: 'actioned' }).where(eq(reports.id, row.id)),
  ).rejects.toThrow();
  await expect(
    db
      .update(reports)
      .set({
        status: 'dismissed',
        resolvedAt: new Date(),
        resolution: 'Dismissed without attribution',
      })
      .where(eq(reports.id, row.id)),
  ).rejects.toThrow();
});
it.each([
  { reason: 'invented' },
  { status: 'invented' },
  { targetType: 'invented' },
  { details: '' },
  { details: 'x'.repeat(4001) },
])('COMM-002: direct invalid report writes remain constrained', async (patch) => {
  const item = await source();
  await expect(
    harness
      .database()
      .insert(reports)
      .values({
        reporterUserId: item.customerA,
        targetType: 'chat_message',
        targetId: item.messageId,
        reason: 'spam',
        ...patch,
      }),
  ).rejects.toThrow();
});
