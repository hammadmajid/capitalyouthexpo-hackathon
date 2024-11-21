import { beforeEach, expect, it, vi } from 'vitest';
import {
  adminAccounts,
  adminRoleGrants,
  branchVerificationEvents,
  branches,
  files,
  listingMedia,
  platformAuditLog,
  roomTypes,
  sensitiveAccessLog,
  ownerProfiles,
} from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { VerificationReadService } from './verification-read.service.js';
import { AuditWriter } from '../audit/writer.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = new Date('2026-10-30T10:00:00Z');
const actor = { userId: id(1) } as Actor;
let store: ReturnType<typeof queryFixture>;
const signer = vi.fn(async () => 'https://private.example.test/signed');
let service: VerificationReadService;
const record = {
  branchId: id(2),
  branchName: 'Branch',
  organizationName: 'Org',
  ownerId: id(3),
  status: 'submitted',
  updatedAt: now,
  completenessScore: null,
  category: 'boys',
  addressLine: 'Listing address',
  description: null,
  fullName: 'Owner fixture',
  cnicLast4: '1234',
  profileCompletedAt: now,
  frontId: id(4),
  backId: id(5),
  cityId: null,
  areaId: null,
  latitude: null,
  longitude: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
  propertyTier: null,
  establishmentYear: null,
};
const file = {
  id: id(4),
  uploadedBy: id(3),
  visibility: 'private',
  bucket: 'private-test',
  objectKey: 'private/verification_document/' + id(4) + '/sha',
  mimeType: 'image/jpeg',
  sizeBytes: 9007199254740993n,
  purpose: 'verification_document',
  scanStatus: 'clean',
  sha256: Buffer.alloc(32),
};
function authorized(role = 'verification', root = false) {
  store.enqueue(adminAccounts, [{ isRoot: root, status: 'active' }]);
  store.enqueue(adminRoleGrants, [{ role }]);
  store.enqueue(branches, [record]);
  store.enqueue(ownerProfiles, [{ frontId: id(4), backId: id(5) }]);
}
beforeEach(() => {
  vi.restoreAllMocks();
  signer.mockClear();
  store = queryFixture();
  service = new VerificationReadService(
    store.database,
    { bucket: 'private-test', storage: { presignDownload: signer } },
    () => now,
  );
});
it('TRUST-002 SEC-003: dossier returns masked metadata only and labels current-record provenance', async () => {
  authorized();
  store.enqueue(files, [file]);
  store.enqueue(branchVerificationEvents, [{ createdAt: now }]);
  const result = await service.dossier(actor, id(2));
  expect(result.owner).toEqual({
    fullName: 'Owner fixture',
    cnicLast4: '1234',
    profileCompletedAt: now.toISOString(),
  });
  expect(result.evidence[0]).toMatchObject({ sizeBytes: '9007199254740993', available: true });
  expect(result.source).toBe('current_record');
  expect(JSON.stringify(result)).not.toMatch(/objectKey|private-test|password|uploadedBy|ownerId/);
  expect(signer).not.toHaveBeenCalled();
});
it.each(['support', 'content_moderator'])(
  'SEC-001: %s cannot read a verification dossier',
  async (role) => {
    authorized(role);
    await expect(service.dossier(actor, id(2))).rejects.toMatchObject({ status: 403 });
  },
);
it('SEC-001: Root override remains independent of Customer profile', async () => {
  authorized('support', true);
  store.enqueue(files, []);
  store.enqueue(branchVerificationEvents, []);
  expect((await service.dossier(actor, id(2))).owner.fullName).toBe('Owner fixture');
});
it('ADM-007: history reads limit+1, returns continuation and omits reviewer account identifiers', async () => {
  authorized();
  store.enqueue(
    branchVerificationEvents,
    [6, 5].map((n) => ({
      id: id(n),
      fromStatus: 'submitted',
      toStatus: 'under_review',
      reason: null,
      reviewerName: 'Verifier',
      createdAt: now,
    })),
  );
  const result = await service.history(actor, id(2), { limit: 1 });
  expect(result.data).toHaveLength(1);
  expect(result.nextCursor).toBe(id(6));
  expect(store.operations).toContainEqual({
    table: branchVerificationEvents,
    kind: 'limit',
    args: [2],
  });
});
it('SEC-003: explicit evidence access audits before signer and never emits storage metadata', async () => {
  authorized();
  store.enqueue(files, [file]);
  const result = await service.evidence(actor, id(2), id(4), {
    justification: 'Review owner identity',
  });
  expect(result).toEqual({
    url: 'https://private.example.test/signed',
    expiresAt: '2026-10-30T10:01:00.000Z',
  });
  expect(store.writes.map((w) => w.table)).toEqual([sensitiveAccessLog, platformAuditLog]);
});
it('SEC-003: sensitive audit failure produces no signed URL', async () => {
  authorized();
  store.enqueue(files, [file]);
  vi.spyOn(AuditWriter.prototype, 'sensitive').mockRejectedValueOnce(
    new Error('Audit unavailable'),
  );
  await expect(
    service.evidence(actor, id(2), id(4), { justification: 'Review owner identity' }),
  ).rejects.toThrow('Audit unavailable');
  expect(signer).not.toHaveBeenCalled();
});
it.each([
  { scanStatus: 'pending' },
  { bucket: 'foreign' },
  { sha256: null },
  { objectKey: 'quarantine/unverified' },
])('SEC-003: unsafe evidence %j is unavailable', async (change) => {
  authorized();
  store.enqueue(files, [{ ...file, ...change }]);
  await expect(
    service.evidence(actor, id(2), id(4), { justification: 'Review owner identity' }),
  ).rejects.toMatchObject({ status: 404 });
  expect(signer).not.toHaveBeenCalled();
});
it('SEC-003: arbitrary owner upload absent from current dossier/listing cannot be signed', async () => {
  authorized();
  store.enqueue(listingMedia, []);
  await expect(
    service.evidence(actor, id(2), id(8), { justification: 'Review owner identity' }),
  ).rejects.toMatchObject({ status: 404 });
});
it('SEC-003: blank purpose is rejected before any file audit or URL', async () => {
  authorized();
  await expect(service.evidence(actor, id(2), id(4), { justification: '' })).rejects.toThrow();
  expect(signer).not.toHaveBeenCalled();
  expect(store.writes).toEqual([]);
});
it('SEC-003: a document replaced between dossier load and access cannot be signed', async () => {
  store.enqueue(adminAccounts, [{ isRoot: true, status: 'active' }]);
  store.enqueue(adminRoleGrants, []);
  store.enqueue(branches, [record]);
  store.enqueue(ownerProfiles, [{ frontId: id(9), backId: id(5) }]);
  store.enqueue(files, [file]);
  await expect(
    service.evidence(actor, id(2), id(4), { justification: 'Owner identity review' }),
  ).rejects.toMatchObject({ status: 404 });
  expect(signer).not.toHaveBeenCalled();
  expect(store.writes).toEqual([]);
});
it('TRUST-002: pricing preserves integer paisa and bound continuation', async () => {
  authorized();
  store.enqueue(
    roomTypes,
    [7, 8].map((n) => ({
      id: id(n),
      name: 'Shared',
      inventoryMode: 'per_bed',
      capacity: 2,
      bedMonthlyRentPaisa: 9007199254740993n,
      roomMonthlyRentPaisa: null,
      depositPaisa: 100n,
    })),
  );
  const result = await service.pricing(actor, id(2), { limit: 1 });
  expect(result.data[0]?.bedMonthlyRentPaisa).toBe('9007199254740993');
  expect(result.nextCursor).toBe(id(7));
});
it('TRUST-002: photo metadata is branch scoped and has no private URLs', async () => {
  authorized();
  store.enqueue(listingMedia, [
    {
      media: { id: id(7), roomId: null, seatId: null, altText: 'Front' },
      file: {
        ...file,
        purpose: 'listing_photo',
        objectKey: 'private/listing_photo/' + id(4) + '/sha',
      },
    },
  ]);
  const result = await service.photos(actor, id(2), {});
  expect(result.data[0]).toMatchObject({ fileId: id(4), available: true });
  expect(signer).not.toHaveBeenCalled();
});
it('AUD-003: verification history orders by decision time before random event UUID', async () => {
  authorized();
  store.enqueue(branchVerificationEvents, []);
  await service.history(actor, id(2), { limit: 1 });
  const order = store.operations.find(
    (operation) => operation.table === branchVerificationEvents && operation.kind === 'orderBy',
  );
  const first = order?.args[0] as { queryChunks?: unknown[] } | undefined;
  expect(first?.queryChunks).toContain(branchVerificationEvents.createdAt);
});
