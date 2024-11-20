import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { v7 } from 'uuid';
import { chatAttachments, chatMessages, conversations, files } from '../src/index.js';
import { inventoryHarness } from './inventory.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
async function prepare() {
  const scope = await harness.scope(),
    conversationId = v7();
  await harness
    .database()
    .insert(conversations)
    .values({ id: conversationId, branchId: scope.branchId, customerUserId: scope.customerA });
  return { ...scope, conversationId };
}
it('COMM-001: exact customer/branch thread uniqueness survives concurrent inserts', async () => {
  const scope = await harness.scope();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      harness
        .database()
        .insert(conversations)
        .values({ id: v7(), branchId: scope.branchId, customerUserId: scope.customerA }),
    ),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
});
it('COMM-001 / SEC-003: deferred source constraints reject empty, false-side and foreign-uploader messages', async () => {
  const scope = await prepare(),
    db = harness.database();
  const base = {
    id: v7(),
    conversationId: scope.conversationId,
    senderUserId: scope.customerA,
    senderSide: 'customer' as const,
  };
  await expect(db.insert(chatMessages).values(base)).rejects.toThrow();
  await expect(
    db
      .insert(chatMessages)
      .values({ ...base, id: v7(), body: 'False identity', senderUserId: scope.customerB }),
  ).rejects.toThrow();
  const fileId = v7();
  await db.insert(files).values({
    id: fileId,
    uploadedBy: scope.customerB,
    visibility: 'private',
    purpose: 'chat_attachment',
    bucket: 'fixture',
    objectKey: 'private/chat_attachment/' + fileId + '/file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 128n,
    scanStatus: 'clean',
    sha256: randomBytes(32),
  });
  await expect(
    db.transaction(async (tx) => {
      await tx.insert(chatMessages).values(base);
      await tx.insert(chatAttachments).values({ messageId: base.id, fileId });
    }),
  ).rejects.toThrow();
  expect(
    await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, scope.conversationId)),
  ).toHaveLength(0);
});
it('COMM-001 / ACC-006: persisted message/attachment terms are immutable and referenced history cannot be deleted/truncated', async () => {
  const scope = await prepare(),
    db = harness.database(),
    messageId = v7(),
    fileId = v7();
  await db.insert(files).values({
    id: fileId,
    uploadedBy: scope.customerA,
    visibility: 'private',
    purpose: 'chat_attachment',
    bucket: 'fixture',
    objectKey: 'private/chat_attachment/' + fileId + '/file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 128n,
    scanStatus: 'clean',
    sha256: randomBytes(32),
  });
  await db.transaction(async (tx) => {
    await tx.insert(chatMessages).values({
      id: messageId,
      conversationId: scope.conversationId,
      senderUserId: scope.customerA,
      senderSide: 'customer',
    });
    await tx.insert(chatAttachments).values({ messageId, fileId });
  });
  await expect(
    db.update(chatMessages).set({ body: 'Rewritten' }).where(eq(chatMessages.id, messageId)),
  ).rejects.toThrow();
  await expect(db.delete(chatMessages).where(eq(chatMessages.id, messageId))).rejects.toThrow();
  await expect(db.execute(sql`TRUNCATE chat_messages CASCADE`)).rejects.toThrow();
  await expect(
    db.delete(chatAttachments).where(eq(chatAttachments.messageId, messageId)),
  ).rejects.toThrow();
  await expect(db.execute(sql`TRUNCATE chat_attachments`)).rejects.toThrow();
  await expect(
    db
      .update(conversations)
      .set({ customerUserId: scope.customerB })
      .where(eq(conversations.id, scope.conversationId)),
  ).rejects.toThrow();
  await expect(
    db.delete(conversations).where(eq(conversations.id, scope.conversationId)),
  ).rejects.toThrow();
  await db
    .update(chatMessages)
    .set({ deletedAt: new Date() })
    .where(eq(chatMessages.id, messageId));
  await expect(
    db.update(chatMessages).set({ deletedAt: null }).where(eq(chatMessages.id, messageId)),
  ).rejects.toThrow();
});
