import { createHash, randomUUID } from 'node:crypto';
import { files } from '@hsm/db';
import { verifiedKey } from '@hsm/files';
import type { phaseTwoFixture } from './phase-two-fixture.js';
export async function proofFile(
  f: Awaited<ReturnType<typeof phaseTwoFixture>>,
  owner = f.customerA,
) {
  const id = randomUUID(),
    bytes = Buffer.from('Rent transfer receipt ' + id),
    key = verifiedKey('payment_proof', id);
  await f.storage.storage.putVerified(key, 'application/pdf', bytes);
  await f.connection.db.insert(files).values({
    id,
    uploadedBy: owner,
    bucket: f.storage.bucket,
    visibility: 'private',
    objectKey: key,
    purpose: 'payment_proof',
    scanStatus: 'clean',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(bytes.length),
    sha256: createHash('sha256').update(bytes).digest(),
  });
  return id;
}
