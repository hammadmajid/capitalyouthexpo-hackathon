import { and, eq } from 'drizzle-orm';
import { files } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
export async function ownedProfileAttachment(
  database: Transaction,
  userId: string,
  bucket: string,
  id: string,
) {
  const [row] = await database
    .select({ id: files.id, purpose: files.purpose, scanStatus: files.scanStatus })
    .from(files)
    .where(
      and(
        eq(files.id, id),
        eq(files.uploadedBy, userId),
        eq(files.bucket, bucket),
        eq(files.visibility, 'private'),
      ),
    )
    .for('update');
  return row;
}
