import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  adminAccounts,
  areas,
  branches,
  brands,
  cities,
  hostelAuditLog,
  hostelRevisions,
  organizations,
  platformAuditLog,
  users,
} from '@hsm/db';
import type { SaveHostelRevision } from '@hsm/contracts';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import { IdempotencyRepository } from '../../src/idempotency/repository.js';
import { HostelRevisionRepository } from '../../src/management/hostel-revision.repository.js';
import { HostelRevisionReviewService } from '../../src/admin/hostel-revision-review.service.js';
import type { Actor } from '../../src/authorization/store.js';
let f: Awaited<ReturnType<typeof authFixture>>;
let ownerActor: Actor, otherActor: Actor, adminActor: Actor;
let repository: HostelRevisionRepository;
let review: HostelRevisionReviewService;
const now = new Date('2026-11-15T10:00:00Z');
const root = randomUUID(),
  owner = randomUUID(),
  other = randomUUID(),
  org = randomUUID(),
  brand = randomUUID(),
  city = randomUUID(),
  area = randomUUID(),
  branch = randomUUID();
const basics = (name: string, description: string) => ({
  name,
  category: 'boys' as const,
  description,
});
beforeAll(async () => {
  f = await authFixture(new AuthCrypto(testKeys()), now);
  const db = f.connection.db;
  await db.insert(users).values([
    { id: root, fullName: 'Revision Root fixture' },
    { id: owner, fullName: 'Owner fixture' },
    { id: other, fullName: 'Other fixture' },
  ]);
  await db.insert(adminAccounts).values({ userId: root, isRoot: true, status: 'active' });
  const session = async (userId: string) => ({
    userId,
    sessionId: (await f.service.issue(userId, 'mobile')).sessionId,
  });
  adminActor = await session(root);
  ownerActor = await session(owner);
  otherActor = await session(other);
  await db.insert(cities).values({ id: city, name: 'Fixture city', slug: city });
  await db
    .insert(areas)
    .values({ id: area, cityId: city, level: 'area', name: 'Fixture area', slug: area });
  await db.insert(organizations).values({ id: org, ownerUserId: owner, name: 'Fixture org' });
  await db.insert(brands).values({ id: brand, organizationId: org, name: 'Live hostel' });
  await db.insert(branches).values({
    id: branch,
    organizationId: org,
    brandId: brand,
    isPrimary: true,
    name: 'Live hostel',
    slug: branch,
    category: 'boys',
    cityId: city,
    areaId: area,
    addressLine: 'Live address 1',
    description: 'Live description',
    location: 'SRID=4326;POINT(73.05 33.68)',
    verificationStatus: 'approved',
    firstApprovedAt: now,
    updatedAt: now,
  });
  repository = new HostelRevisionRepository(db, 'fixture-bucket', undefined, () => now);
  review = new HostelRevisionReviewService(
    db,
    new IdempotencyService(new IdempotencyRepository(db), () => now),
    () => now,
  );
});
afterAll(async () => {
  await f?.close();
});
function save(input: SaveHostelRevision) {
  return f.connection.db.transaction((t) => repository.save(t, ownerActor, brand, input, now));
}
function submit(version: number) {
  return f.connection.db.transaction((t) => repository.submit(t, ownerActor, brand, version, now));
}
async function live() {
  const [row] = await f.connection.db.select().from(branches).where(eq(branches.id, branch));
  const [hostel] = await f.connection.db.select().from(brands).where(eq(brands.id, brand));
  return { ...row, hostelName: hostel?.name };
}
it('CHG-041 / ACC-003: only the owning Owner reads the hostel and its pending changes', async () => {
  const state = await repository.read(ownerActor, brand);
  expect(state.revision).toBeNull();
  expect(state.live.mainBranch?.verificationStatus).toBe('approved');
  await expect(repository.read(otherActor, brand)).rejects.toMatchObject({ status: 404 });
});
it('CHG-041: saved and sent changes never touch the live listing; rejection keeps it', async () => {
  const saved = await save({
    expectedVersion: null,
    basics: basics('Renamed hostel', 'New description'),
  });
  expect(saved.revision?.status).toBe('draft');
  await expect(
    save({ expectedVersion: null, basics: basics('Second', 'other') }),
  ).rejects.toMatchObject({ status: 412 });
  const sent = await submit(saved.revision?.version ?? 0);
  expect(sent.revision?.status).toBe('submitted');
  await expect(
    save({ expectedVersion: sent.revision?.version ?? 0, basics: basics('Again', 'again') }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await live()).toMatchObject({
    hostelName: 'Live hostel',
    description: 'Live description',
    verificationStatus: 'approved',
  });
  const queue = await review.queue(adminActor, {});
  expect(queue.data.map((row) => row.id)).toContain(sent.revision?.id);
  await expect(review.queue(ownerActor, {})).rejects.toMatchObject({ status: 403 });
  const id = sent.revision?.id ?? '';
  const detail = await review.read(adminActor, id);
  expect(detail.live.name).toBe('Live hostel');
  expect(detail.revision.changes.basics?.name).toBe('Renamed hostel');
  // The Admin sees the live city by name, never as a raw id.
  const cityId = detail.live.mainBranch?.cityId;
  if (cityId) expect(detail.placeNames?.[cityId]).toEqual(expect.any(String));
  else expect(detail.placeNames).toEqual({});
  // A rejection without a reason is refused before anything is written.
  await expect(
    Promise.resolve().then(() =>
      review.decide(adminActor, randomUUID(), id, {
        expectedVersion: detail.revision.version,
        action: 'reject',
      }),
    ),
  ).rejects.toThrow('A reason is required to reject');
  const key = randomUUID();
  const body = {
    expectedVersion: detail.revision.version,
    action: 'reject',
    reason: 'Name unclear',
  };
  const rejected = await review.decide(adminActor, key, id, body);
  expect(rejected.body.status).toBe('rejected');
  expect((await review.decide(adminActor, key, id, body)).replayed).toBe(true);
  expect(await live()).toMatchObject({
    hostelName: 'Live hostel',
    verificationStatus: 'approved',
  });
  const state = await repository.read(ownerActor, brand);
  expect(state.revision).toMatchObject({ status: 'rejected', decisionNote: 'Name unclear' });
});
it('CHG-041 / ACC-006: approval publishes the changes, keeps the hostel approved and is audited', async () => {
  const first = await save({
    expectedVersion: null,
    basics: basics('Approved name', 'Approved description'),
  });
  const second = await save({
    expectedVersion: first.revision?.version ?? 0,
    main: { name: 'Approved name', addressLine: 'New address 22' },
  });
  expect(second.revision?.changes.basics?.name).toBe('Approved name');
  const sent = await submit(second.revision?.version ?? 0);
  const id = sent.revision?.id ?? '';
  const approved = await review.decide(adminActor, randomUUID(), id, {
    expectedVersion: sent.revision?.version ?? 0,
    action: 'approve',
  });
  expect(approved.body.status).toBe('approved');
  expect(await live()).toMatchObject({
    hostelName: 'Approved name',
    description: 'Approved description',
    addressLine: 'New address 22',
    verificationStatus: 'approved',
  });
  await expect(
    review.decide(adminActor, randomUUID(), id, {
      expectedVersion: approved.body.version,
      action: 'approve',
    }),
  ).rejects.toMatchObject({ status: 409 });
  const platform = await f.connection.db
    .select({ action: platformAuditLog.action })
    .from(platformAuditLog)
    .where(eq(platformAuditLog.targetId, branch));
  expect(platform.map((row) => row.action)).toEqual(
    expect.arrayContaining(['hostel.revision.reject', 'hostel.revision.approve']),
  );
  const owned = await f.connection.db
    .select({ action: hostelAuditLog.action })
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, brand));
  expect(owned.map((row) => row.action)).toEqual(
    expect.arrayContaining(['hostel.revision.saved', 'hostel.revision.submitted']),
  );
});
it('CHG-041: withdrawing discards waiting changes; a non-approved hostel takes no revision', async () => {
  const saved = await save({ expectedVersion: null, basics: basics('Draft name', 'draft') });
  const gone = await f.connection.db.transaction((t) =>
    repository.withdraw(t, ownerActor, brand, saved.revision?.version ?? 0, now),
  );
  expect(gone.revision).toBeNull();
  expect(
    await f.connection.db
      .select()
      .from(hostelRevisions)
      .where(eq(hostelRevisions.status, 'cancelled')),
  ).toHaveLength(1);
  await f.connection.db
    .update(branches)
    .set({ verificationStatus: 'suspended' })
    .where(eq(branches.id, branch));
  await expect(
    save({ expectedVersion: null, basics: basics('Not allowed', 'no') }),
  ).rejects.toMatchObject({ status: 409 });
});
