import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { files, users } from '@hsm/db';
import type { authFixture } from './auth-fixture.js';
export type OwnerFixture = Awaited<ReturnType<typeof authFixture>>;
export async function ownerIdentity(fixture: OwnerFixture, permanentHash: string, now: Date) {
  const [user] = await fixture.connection.db
    .insert(users)
    .values({
      fullName: '',
      email: randomUUID() + '@example.test',
      emailVerifiedAt: now,
      passwordHash: permanentHash,
    })
    .returning();
  if (!user) throw new Error('Missing Owner identity fixture');
  const credential = await fixture.service.issue(user.id, 'mobile');
  const cnicFrontFileId = await ownerDocument(fixture, user.id);
  const cnicBackFileId = await ownerDocument(fixture, user.id);
  return {
    user,
    credential,
    headers: { authorization: 'Bearer ' + credential.accessToken },
    body: {
      fullName: 'Owner Integration',
      phone: '+923' + randomInt(100000000, 999999999).toString(),
      cnic: '35202' + randomInt(1000000, 9999999).toString() + randomInt(0, 10).toString(),
      cnicFrontFileId,
      cnicBackFileId,
      address: 'Private Owner correspondence address',
      agreementAccepted: true as const,
      agreementVersion: 'owner-foundation-v1' as const,
    },
  };
}
export async function ownerDocument(
  fixture: OwnerFixture,
  userId: string,
  patch: Partial<typeof files.$inferInsert> = {},
) {
  const [row] = await fixture.connection.db
    .insert(files)
    .values({
      uploadedBy: userId,
      visibility: 'private',
      bucket: 'auth-private-fixture',
      objectKey: randomUUID(),
      mimeType: 'image/jpeg',
      sizeBytes: 100n,
      sha256: randomBytes(32),
      purpose: 'verification_document',
      scanStatus: 'clean',
      ...patch,
    })
    .returning();
  if (!row) throw new Error('Missing private Owner document fixture');
  return row.id;
}
export const ownerRequest = (
  fixture: OwnerFixture,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) =>
  fixture.application.inject({
    method: 'PUT',
    url: '/v1/me/owner-profile',
    headers,
    payload: body,
  });
