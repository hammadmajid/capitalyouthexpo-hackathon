import { createHash, randomUUID } from 'node:crypto';
import { files } from '@hsm/db';
import { verifiedKey } from '@hsm/files';
import { inventoryImportIdentitySchema, inventoryImportPreviewSchema } from '@hsm/contracts';
import type { phaseTwoFixture } from './phase-two-fixture.js';
export type ImportFixture = Awaited<ReturnType<typeof phaseTwoFixture>>;
export async function csvFile(f: ImportFixture, csv: string, uploader = f.ownerId, clean = true) {
  const id = randomUUID(),
    bytes = Buffer.from(csv),
    key = verifiedKey('import', id);
  await f.storage.storage.putVerified(key, 'text/csv', bytes);
  await f.connection.db
    .insert(files)
    .values({
      id,
      uploadedBy: uploader,
      bucket: f.storage.bucket,
      visibility: 'private',
      objectKey: key,
      mimeType: 'text/csv',
      sizeBytes: BigInt(bytes.length),
      purpose: 'import',
      scanStatus: clean ? 'clean' : 'pending',
      sha256: clean ? createHash('sha256').update(bytes).digest() : null,
    });
  return id;
}
export function command(
  f: ImportFixture,
  branchId: string,
  suffix: string,
  payload: Record<string, unknown>,
  key: string = randomUUID(),
  token = f.ownerToken,
) {
  return {
    method: 'POST' as const,
    url: `/v1/branches/${branchId}/inventory/imports${suffix}`,
    payload,
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
  };
}
export async function validate(
  f: ImportFixture,
  branchId: string,
  fileId: string,
  kind: 'rooms' | 'seats' = 'rooms',
) {
  const request = command(f, branchId, '', { kind, fileId }),
    response = await f.application.inject(request);
  if (response.statusCode !== 201) throw new Error('Fixture validation failed: ' + response.body);
  const identity = inventoryImportIdentitySchema.parse(response.json());
  return { request, identity };
}
export async function preview(f: ImportFixture, branchId: string, id: string, query = '') {
  const response = await f.application.inject({
    url: `/v1/branches/${branchId}/inventory/imports/${id}${query}`,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  if (response.statusCode !== 200) throw new Error('Fixture preview failed: ' + response.body);
  return inventoryImportPreviewSchema.parse(response.json());
}
