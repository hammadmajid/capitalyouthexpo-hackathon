import { and, eq, inArray, isNull } from 'drizzle-orm';
import { chatAttachments, chatMessages, files } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { storageKey } from '@hsm/files';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
function valid(file: typeof files.$inferSelect, bucket: string) {
  return (
    ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimeType) &&
    file.sizeBytes > 0n &&
    file.sizeBytes <= 10000000n &&
    storageKey.safeParse(file.objectKey).success &&
    file.bucket === bucket &&
    file.visibility === 'private' &&
    file.purpose === 'chat_attachment' &&
    file.scanStatus === 'clean' &&
    file.sha256?.length === 32 &&
    file.objectKey.startsWith('private/chat_attachment/' + file.id + '/')
  );
}
export async function attachChatFiles(
  tx: Transaction,
  actor: Actor,
  messageId: string,
  ids: string[],
  bucket: string,
) {
  if (!ids.length) return;
  const rows = await tx
    .select()
    .from(files)
    .where(and(inArray(files.id, ids), eq(files.uploadedBy, actor.userId)))
    .orderBy(files.id)
    .for('update');
  if (rows.length !== ids.length || rows.some((file) => !valid(file, bucket)))
    throw new DomainError('NOT_FOUND', 404, 'Clean own chat attachment required');
  const reused = await tx
    .select({ id: chatAttachments.fileId })
    .from(chatAttachments)
    .where(inArray(chatAttachments.fileId, ids))
    .limit(1);
  if (reused.length)
    throw new DomainError('CONFLICT', 409, 'Attachment already belongs to a message');
  await tx.insert(chatAttachments).values(ids.map((fileId) => ({ messageId, fileId })));
}
export async function readChatFile(
  tx: Transaction,
  conversationId: string,
  fileId: string,
  bucket: string,
) {
  const [row] = await tx
    .select({ file: files })
    .from(chatAttachments)
    .innerJoin(chatMessages, eq(chatMessages.id, chatAttachments.messageId))
    .innerJoin(files, eq(files.id, chatAttachments.fileId))
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        eq(files.id, fileId),
        isNull(chatMessages.deletedAt),
      ),
    );
  if (!row || !valid(row.file, bucket))
    throw new DomainError('NOT_FOUND', 404, 'Attachment unavailable');
  return row.file;
}
