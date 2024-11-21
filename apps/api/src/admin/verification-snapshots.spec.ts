import { beforeEach, expect, it, vi } from 'vitest';
import {
  adminAccounts,
  adminRoleGrants,
  branches,
  files,
  roomTypes,
  listingMedia,
  verificationSubmissions,
  verificationSnapshotItems,
  branchVerificationEvents,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { captureVerification } from './verification-capture.js';
import { VerificationSnapshotsService } from './verification-snapshots.service.js';
import { verificationDossierSchema } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = new Date('2026-10-30T10:00:00Z');
const actor = { userId: id(1) } as Actor;
let store: ReturnType<typeof queryFixture>;
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
  frontId: null,
  backId: null,
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
function authorized() {
  store.enqueue(adminAccounts, [{ isRoot: true, status: 'active' }]);
  store.enqueue(adminRoleGrants, []);
  store.enqueue(branches, [record]);
}
const price = (n: number) => ({
  id: id(n),
  name: 'Shared',
  inventoryMode: 'per_bed',
  capacity: 2,
  bedMonthlyRentPaisa: 100n,
  roomMonthlyRentPaisa: null,
  depositPaisa: 200n,
});
beforeEach(() => {
  store = queryFixture();
});
it('TRUST-002: submission captures every price/photo batch and writes only new immutable records', async () => {
  store.enqueue(branches, [record]);
  store.enqueue(files, []);
  store.enqueue(roomTypes, [price(4)], [price(5)], []);
  store.enqueue(listingMedia, []);
  const submission = await captureVerification(store.transaction, id(2), id(3), now);
  const header = store.writes.find((row) => row.table === verificationSubmissions)?.value as {
    dossier: unknown;
  };
  expect(verificationDossierSchema.parse(header.dossier).submittedAt).toBe(now.toISOString());
  const batches = store.writes.filter(
    (row) => row.table === verificationSnapshotItems && Array.isArray(row.value),
  );
  expect(batches).toHaveLength(2);
  expect(JSON.stringify(store.writes.map((row) => row.value))).not.toMatch(
    /objectKey|bucket|passwordHash/,
  );
  expect(store.writes.every((row) => row.kind === 'insert')).toBe(true);
  expect(submission).toMatch(/^[a-f0-9-]{36}$/);
});
it('SEC-003: cross-owner submission is denied before capture writes', async () => {
  store.enqueue(branches, [record]);
  await expect(captureVerification(store.transaction, id(2), id(8), now)).rejects.toMatchObject({
    status: 403,
  });
  expect(store.writes).toEqual([]);
});
it('TRUST-002: legacy missing snapshot remains explicit, without fabricated historical backfill', async () => {
  authorized();
  store.enqueue(verificationSubmissions, []);
  store.enqueue(branchVerificationEvents, []);
  const result = await new VerificationSnapshotsService(store.database).comparison(actor, id(2));
  expect(result).toEqual({
    current: null,
    lastApproved: null,
    changedFields: [],
    historicalSnapshotUnavailable: true,
  });
  expect(store.writes).toEqual([]);
});
it('SEC-003: snapshot child pages validate the branch association before returning data', async () => {
  authorized();
  store.enqueue(verificationSubmissions, []);
  await expect(
    new VerificationSnapshotsService(store.database).items(actor, id(2), id(8), {
      kind: 'pricing',
    }),
  ).rejects.toMatchObject({ status: 404 });
});
