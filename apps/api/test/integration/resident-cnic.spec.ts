import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { files, hostelAuditLog, idempotencyKeys, residents, stayHistory } from '@hsm/db';
import { manualAdmissionResultSchema, residentProfileSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { admitResident, manualAdmissionFixture } from './manual-admission.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-04T10:00:00Z'), undefined, {
    preScannedInventory: true,
  });
});
afterAll(async () => {
  await f?.close();
});
const plain = '35202-1234567-1';
it('CHG-054 / CHG-004: a new resident CNIC is stored encrypted and shown only as its last 4', async () => {
  const item = await manualAdmissionFixture(f);
  const body = structuredClone(item.input) as {
    manual: { resident: { kind: 'new'; profile: Record<string, unknown> } };
  };
  body.manual.resident.profile.cnic = plain;
  const key = randomUUID();
  const response = await admitResident(f, item, key, f.ownerToken, body);
  expect(response.statusCode, response.body).toBe(201);
  const result = manualAdmissionResultSchema.parse(response.json());
  const [row] = await f.connection.db
    .select()
    .from(residents)
    .where(eq(residents.id, result.residentId));
  expect(row?.cnicLast4).toBe('5671');
  expect(row?.cnicHash?.length).toBe(32);
  expect(row?.cnicEncrypted?.toString('utf8')).not.toContain('3520212345671');
  // The plain number is nowhere else: history, audit and the idempotency record.
  const history = await f.connection.db
    .select()
    .from(stayHistory)
    .where(eq(stayHistory.stayId, result.stayId));
  const audits = await f.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.branchId, item.branchId));
  const keys = await f.connection.db.select().from(idempotencyKeys);
  const stored = JSON.stringify([history, audits, keys], (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  expect(stored).not.toContain('3520212345671');
  expect(stored).not.toContain(plain);
  const profile = await f.application.inject({
    url: `/v1/branches/${item.branchId}/residents/${result.residentId}`,
    headers: { authorization: 'Bearer ' + f.ownerToken },
  });
  expect(profile.statusCode, profile.body).toBe(200);
  expect(residentProfileSchema.parse(profile.json()).cnicLast4).toBe('5671');
  expect(profile.body).not.toContain('3520212345671');
  // A same-key replay with the same CNIC is the same command.
  const replay = await admitResident(f, item, key, f.ownerToken, body);
  expect(replay.headers['idempotency-replayed']).toBe('true');
});
it('CHG-054: a malformed CNIC is refused', async () => {
  const item = await manualAdmissionFixture(f);
  const body = structuredClone(item.input) as {
    manual: { resident: { kind: 'new'; profile: Record<string, unknown> } };
  };
  body.manual.resident.profile.cnic = '12345';
  expect((await admitResident(f, item, randomUUID(), f.ownerToken, body)).statusCode).toBe(400);
});

async function cnicPhoto(patch: Partial<typeof files.$inferInsert> = {}) {
  const id = randomUUID();
  await f.connection.db.insert(files).values({
    id,
    uploadedBy: f.ownerId,
    visibility: 'private',
    bucket: f.storage.bucket,
    objectKey: 'private/resident_document/' + id + '/cnic.png',
    mimeType: 'image/png',
    sizeBytes: 100n,
    sha256: randomBytes(32),
    purpose: 'resident_document',
    scanStatus: 'clean',
    ...patch,
  });
  return id;
}
it('RES-001 / SEC-003: manual admission atomically keeps its clean private CNIC photo and replays once', async () => {
  const item = await manualAdmissionFixture(f),
    photo = await cnicPhoto(),
    key = randomUUID();
  const body = { ...item.input, cnicPhotoFileId: photo };
  const response = await admitResident(f, item, key, f.ownerToken, body);
  expect(response.statusCode, response.body).toBe(201);
  const result = manualAdmissionResultSchema.parse(response.json());
  const [resident] = await f.connection.db
    .select()
    .from(residents)
    .where(eq(residents.id, result.residentId));
  expect(resident?.cnicPhotoFileId).toBe(photo);
  const replay = await admitResident(f, item, key, f.ownerToken, body);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  const audits = await f.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, result.residentId));
  expect(audits.filter((a) => a.action === 'resident.cnic_photo.attached')).toHaveLength(1);
});
it.each([
  ['foreign uploader', {}, 404],
  ['pending scan', { scanStatus: 'pending' as const }, 409],
  ['public file', { visibility: 'public' as const }, 404],
  ['wrong bucket', { bucket: 'other-private-bucket' }, 404],
  ['PDF', { mimeType: 'application/pdf' }, 404],
  ['wrong purpose', { purpose: 'avatar' as const }, 404],
])(
  'SEC-003: %s CNIC photo cannot create a partial resident or Stay',
  async (kind, patch, status) => {
    const item = await manualAdmissionFixture(f);
    const photo = await cnicPhoto(
      kind === 'foreign uploader' ? { uploadedBy: f.customerA } : patch,
    );
    const response = await admitResident(f, item, randomUUID(), f.ownerToken, {
      ...item.input,
      cnicPhotoFileId: photo,
    });
    expect(response.statusCode, response.body).toBe(status);
    const admitted = await f.connection.db
      .select()
      .from(residents)
      .where(eq(residents.branchId, item.branchId));
    expect(admitted).toHaveLength(0);
  },
);
