import { CustomerProfileRepository } from '../../src/auth/customer-profile.repository.js';
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  adminAccounts,
  adminRoleGrants,
  files,
  notificationOutbox,
  ownerProfiles,
  platformAuditLog,
  profileReviewDecisions,
  profileReviewEvidence,
  profileReviewRequests,
  sensitiveAccessLog,
  sessions,
  users,
} from '@hsm/db';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuditWriter } from '../../src/audit/writer.js';
import type { Actor } from '../../src/authorization/store.js';
import {
  ProfileReviewService,
  assertProfileReviewSchema,
} from '../../src/admin/profile-review.service.js';
import { authFixture } from './auth-fixture.js';
import { testKeys } from '../keys.js';
const now = new Date('2026-10-30T16:00:00.000Z'),
  crypto = new AuthCrypto(testKeys()),
  bucket = 'disposable-profile-private';
const signer = vi.fn(async () => 'https://files.example.test/controlled');
let f: Awaited<ReturnType<typeof authFixture>>, service: ProfileReviewService;
const staff: Record<string, Actor> = {},
  headers: Record<string, string> = {};
const cnic = () => '12345' + String(randomInt(10000000, 99999999));
beforeAll(async () => {
  f = await authFixture(crypto, now, {}, [], (database, idempotency) => {
    service = new ProfileReviewService(
      { database, idempotency, crypto, bucket, clock: () => now },
      { bucket, storage: { presignDownload: signer } },
    );
    return { profileReviews: service };
  });
  for (const role of ['root', 'content_moderator', 'verification', 'support']) {
    const userId = randomUUID();
    await f.connection.db.insert(users).values({
      id: userId,
      fullName: 'Disposable ' + role,
      emailVerifiedAt: now,
      passwordHash: 'fixture-hash',
    });
    await f.connection.db
      .insert(adminAccounts)
      .values({ userId, isRoot: role === 'root', status: 'active' });
    if (role !== 'root')
      await f.connection.db.insert(adminRoleGrants).values({
        adminUserId: userId,
        role: role as 'content_moderator' | 'verification' | 'support',
        grantedByUserId: staff.root?.userId ?? userId,
      });
    const issued = await f.service.issue(userId, 'mobile');
    const [session] = await f.connection.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
    if (!session) throw new Error('Missing fixture session');
    staff[role] = { userId, sessionId: session.id };
    headers[role] = 'Bearer ' + issued.accessToken;
  }
  await assertProfileReviewSchema(f.connection.db);
});
afterAll(async () => {
  await f?.close();
});
function actor(role = 'root') {
  const value = staff[role];
  if (!value) throw new Error('Missing staff fixture');
  return value;
}
async function subject() {
  const userId = randomUUID(),
    originalCnic = cnic();
  await f.connection.db.insert(users).values({
    id: userId,
    fullName: 'Original fixture identity',
    email: userId + '@example.test',
    emailVerifiedAt: now,
    passwordHash: 'fixture-hash',
    ...crypto.protectCnic(originalCnic),
    updatedAt: now,
  });
  const issued = await f.service.issue(userId, 'mobile');
  const [session] = await f.connection.db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId));
  if (!session) throw new Error('Missing own fixture session');
  return {
    actor: { userId, sessionId: session.id },
    header: 'Bearer ' + issued.accessToken,
    originalCnic,
  };
}
async function attachment(userId: string, purpose: 'avatar' | 'verification_document') {
  const id = randomUUID();
  await f.connection.db.insert(files).values({
    id,
    uploadedBy: userId,
    bucket,
    visibility: 'private',
    objectKey: `private/${purpose}/${id}/clean`,
    purpose,
    scanStatus: 'clean',
    sha256: Buffer.alloc(32, 1),
    mimeType: 'image/png',
    sizeBytes: 100n,
  });
  return id;
}
async function correction() {
  const user = await subject(),
    front = await attachment(user.actor.userId, 'verification_document'),
    back = await attachment(user.actor.userId, 'verification_document');
  const input = {
    fullName: 'Corrected legal fixture identity',
    cnic: cnic(),
    reason: 'Documented legal identity correction',
    evidenceFileIds: [front, back],
  };
  const created = await service.submit(user.actor, randomUUID(), 'identity', input);
  return { user, input, review: created.body };
}
it('HMA-015: identity approval is private, versioned, idempotent, updates Owner evidence and revokes sessions', async () => {
  const { user, input, review } = await correction(),
    db = f.connection.db;
  const oldFront = await attachment(user.actor.userId, 'verification_document'),
    oldBack = await attachment(user.actor.userId, 'verification_document');
  await db.insert(ownerProfiles).values({
    userId: user.actor.userId,
    cnicFrontFileId: oldFront,
    cnicBackFileId: oldBack,
    address: 'Disposable fixture address',
    agreementVersion: 'owner-foundation-v1',
    agreementAcceptedAt: now,
    profileCompletedAt: now,
  });
  expect(JSON.stringify(await service.read.list(actor(), 'identity', {}))).not.toContain(
    input.cnic,
  );
  const detail = await service.read.detail(actor(), review.id, 'identity', {
    justification: 'Validate submitted legal identity evidence',
  });
  expect(detail.proposedCnic).toBe(input.cnic);
  expect(
    await db.select().from(sensitiveAccessLog).where(eq(sensitiveAccessLog.resourceId, review.id)),
  ).toHaveLength(1);
  const key = randomUUID(),
    body = {
      action: 'approve',
      expectedVersion: 1,
      reason: 'Identity evidence matches the requested correction',
    };
  expect((await service.decide(actor(), key, review.id, 'identity', body)).body.status).toBe(
    'approved',
  );
  expect((await service.decide(actor(), key, review.id, 'identity', body)).replayed).toBe(true);
  const [updated] = await db.select().from(users).where(eq(users.id, user.actor.userId));
  expect(updated?.fullName).toBe(input.fullName);
  expect(updated?.cnicLast4).toBe(input.cnic.slice(-4));
  expect(updated?.cnicEncrypted && crypto.decrypt(updated.cnicEncrypted, 'cnic')).toBe(input.cnic);
  const [owner] = await db
    .select()
    .from(ownerProfiles)
    .where(eq(ownerProfiles.userId, user.actor.userId));
  expect(owner?.cnicFrontFileId).toBe(input.evidenceFileIds[0]);
  expect(owner?.cnicBackFileId).toBe(input.evidenceFileIds[1]);
  expect(
    (await db.select().from(sessions).where(eq(sessions.userId, user.actor.userId))).every(
      (row) => row.revokedAt !== null,
    ),
  ).toBe(true);
  expect(
    await db
      .select()
      .from(profileReviewDecisions)
      .where(eq(profileReviewDecisions.requestId, review.id)),
  ).toHaveLength(1);
  const audits = await db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.targetId, review.id));
  expect(
    JSON.stringify(audits, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ).not.toContain(input.cnic);
  expect(
    JSON.stringify(audits, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ).not.toContain(input.fullName);
});
it('HMA-015 SEC-003: real HTTP role/object checks deny private identity, foreign self access and unsigned evidence', async () => {
  const { user, review, input } = await correction(),
    foreign = await subject();
  for (const role of ['content_moderator', 'verification', 'support']) {
    const response = await f.application.inject({
      method: 'POST',
      url: `/v1/admin/profile-reviews/identity/${review.id}/access`,
      headers: { authorization: headers[role] },
      payload: { justification: 'Attempting restricted identity investigation' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain(input.cnic);
  }
  expect(
    (
      await f.application.inject({
        method: 'POST',
        url: `/v1/me/profile-reviews/identity/${review.id}/access`,
        headers: { authorization: foreign.header },
        payload: { justification: 'View my private correction request' },
      })
    ).statusCode,
  ).toBe(404);
  signer.mockClear();
  await expect(
    service.read.evidence(actor(), review.id, 'identity', randomUUID(), {
      justification: 'Check exact attached evidence only',
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect(signer).not.toHaveBeenCalled();
  await service.read.evidence(actor(), review.id, 'identity', input.evidenceFileIds[0] ?? '', {
    justification: 'Check exact attached evidence only',
  });
  expect(signer).toHaveBeenCalledTimes(1);
  const own = await f.application.inject({
    url: '/v1/me/profile-reviews/identity',
    headers: { authorization: user.header },
  });
  expect(own.statusCode).toBe(200);
  expect(own.body).not.toContain(input.cnic);
});
it('HMA-015: stale parent identity and duplicate pending requests cannot overwrite newer data', async () => {
  const { user, input, review } = await correction(),
    db = f.connection.db;
  await expect(service.submit(user.actor, randomUUID(), 'identity', input)).rejects.toMatchObject({
    status: 409,
  });
  await db
    .update(users)
    .set({ fullName: 'Independent reviewed correction' })
    .where(eq(users.id, user.actor.userId));
  await expect(
    service.decide(actor(), randomUUID(), review.id, 'identity', {
      action: 'approve',
      expectedVersion: 1,
      reason: 'Reviewed the original submitted evidence',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (
      await db.select().from(profileReviewRequests).where(eq(profileReviewRequests.id, review.id))
    )[0]?.status,
  ).toBe('pending');
  expect(
    await db
      .select()
      .from(profileReviewDecisions)
      .where(eq(profileReviewDecisions.requestId, review.id)),
  ).toHaveLength(0);
});
it('HMA-015: photo approval races commit once and withdrawal never resurrects an old image', async () => {
  const user = await subject(),
    fileId = await attachment(user.actor.userId, 'avatar'),
    db = f.connection.db;
  const review = (
    await service.submit(user.actor, randomUUID(), 'profile_photo', {
      fileId,
      reason: 'Use the newly uploaded profile picture',
    })
  ).body;
  const body = {
    action: 'approve',
    expectedVersion: 1,
    reason: 'Profile photo meets published content rules',
  };
  const results = await Promise.allSettled([
    service.decide(actor(), randomUUID(), review.id, 'profile_photo', body),
    service.decide(actor('content_moderator'), randomUUID(), review.id, 'profile_photo', body),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await db.select().from(users).where(eq(users.id, user.actor.userId)))[0]?.profilePhotoFileId,
  ).toBe(fileId);
  expect(
    (
      await service.decide(actor('content_moderator'), randomUUID(), review.id, 'profile_photo', {
        action: 'withdraw',
        expectedVersion: 2,
        reason: 'Misleading photo identified in a follow-up review',
      })
    ).body.status,
  ).toBe('withdrawn');
  expect(
    (await db.select().from(users).where(eq(users.id, user.actor.userId)))[0]?.profilePhotoFileId,
  ).toBeNull();
  await expect(
    service.decide(actor(), randomUUID(), review.id, 'profile_photo', body),
  ).rejects.toMatchObject({ status: 409 });
  const history = await service.read.history(actor(), review.id, 'profile_photo', { limit: 1 });
  expect(history.data[0]?.action).toBe('withdraw');
  expect(history.nextCursor).toBe(3);
  expect(
    (await service.read.history(actor(), review.id, 'profile_photo', { cursor: 3 })).data[0]
      ?.action,
  ).toBe('approve');
});
it('HMA-015: legacy current avatars are reviewed without fabricated approval or subject cancellation', async () => {
  const user = await subject(),
    fileId = await attachment(user.actor.userId, 'avatar'),
    db = f.connection.db;
  await db.update(users).set({ profilePhotoFileId: fileId }).where(eq(users.id, user.actor.userId));
  const review = (
    await service.flagPhoto(actor('content_moderator'), randomUUID(), user.actor.userId, {
      fileId,
      reason: 'Reported misleading legacy profile photo',
    })
  ).body;
  await expect(
    service.cancel(user.actor, randomUUID(), review.id, 'profile_photo', {
      expectedVersion: 1,
      reason: 'Trying to cancel a staff moderation case',
    }),
  ).rejects.toMatchObject({ status: 403 });
  await service.decide(actor('content_moderator'), randomUUID(), review.id, 'profile_photo', {
    action: 'reject',
    expectedVersion: 1,
    reason: 'The current avatar violates the photo content policy',
  });
  expect(
    (await db.select().from(users).where(eq(users.id, user.actor.userId)))[0]?.profilePhotoFileId,
  ).toBeNull();
});
it('HMA-015 AUD-001: audit outage rolls back approval and database guards reject history/payload tampering', async () => {
  const { review, user } = await correction(),
    db = f.connection.db;
  const audit = vi
    .spyOn(AuditWriter.prototype, 'platform')
    .mockRejectedValueOnce(new Error('Disposable audit outage'));
  await expect(
    service.decide(actor(), randomUUID(), review.id, 'identity', {
      action: 'approve',
      expectedVersion: 1,
      reason: 'Reviewed legal identity documents carefully',
    }),
  ).rejects.toMatchObject({ status: 503 });
  audit.mockRestore();
  expect(
    (
      await db.select().from(profileReviewRequests).where(eq(profileReviewRequests.id, review.id))
    )[0]?.status,
  ).toBe('pending');
  expect((await db.select().from(users).where(eq(users.id, user.actor.userId)))[0]?.fullName).toBe(
    'Original fixture identity',
  );
  expect(
    await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientUserId, user.actor.userId)),
  ).toHaveLength(0);
  await expect(
    db
      .update(profileReviewRequests)
      .set({ proposedFullName: 'Tampered identity' })
      .where(eq(profileReviewRequests.id, review.id)),
  ).rejects.toThrow();
  await expect(
    db.delete(profileReviewEvidence).where(eq(profileReviewEvidence.requestId, review.id)),
  ).rejects.toThrow();
  await expect(
    db.transaction(async (tx) => {
      await tx
        .update(profileReviewRequests)
        .set({ status: 'approved', version: 2, updatedAt: new Date(now.getTime() + 1) })
        .where(eq(profileReviewRequests.id, review.id));
    }),
  ).rejects.toThrow();
  await service.decide(actor(), randomUUID(), review.id, 'identity', {
    action: 'reject',
    expectedVersion: 1,
    reason: 'Evidence does not establish the requested correction',
  });
  await expect(
    db.delete(profileReviewDecisions).where(eq(profileReviewDecisions.requestId, review.id)),
  ).rejects.toThrow();
});

it('CHG-027 / CHG-031: profile photos attach directly even with profile reviews enabled', async () => {
  const user = await subject(),
    fileId = await attachment(user.actor.userId, 'avatar'),
    db = f.connection.db;
  const repository = new CustomerProfileRepository(db, bucket, undefined, () => now);
  const body = {
    fullName: 'Original fixture identity',
    phone: '+923' + String(randomInt(100000000, 999999999)),
    age: 21,
    gender: 'male' as const,
    profilePhotoFileId: fileId,
  };
  await expect(
    repository.transaction(user.actor, (tx) => tx.save(body, now)),
  ).resolves.toBeUndefined();
});
