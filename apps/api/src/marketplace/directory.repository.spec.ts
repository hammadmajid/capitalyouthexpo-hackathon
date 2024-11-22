import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { adminAccounts, cities, areas, places, placeAliases } from '@hsm/db';
import { institutionGovernanceInputSchema } from '@hsm/contracts';
import { AuditWriter } from '../audit/writer.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { InstitutionRepository } from './directory.repository.js';
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('../authorization/repository.js', () => ({
  ScopeRepository: class {
    admin = mocks.admin;
  },
}));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  cityId = randomUUID(),
  areaId = randomUUID(),
  placeId = randomUUID();
const now = new Date('2026-10-14T12:00:00Z');
const input = institutionGovernanceInputSchema.parse({
  name: 'Approved university',
  changeReason: 'Verified institution reference details',
  shortName: 'UNI',
  cityId,
  areaId: null,
  address: 'Public campus',
  latitude: 33.68,
  longitude: 73.04,
  aliases: ['University alias'],
  isActive: true,
  publicApproved: true,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ isRoot: true, roles: [] });
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  const record = vi.spyOn(audit, 'platform').mockResolvedValue(undefined);
  return { ...store, record, repository: new InstitutionRepository(audit, () => now) };
}
it('ACC-004: directory mutations require both a locked live Root account and revalidated Root scope', async () => {
  const store = fixture();
  store.enqueue(adminAccounts, [{ id: actor.userId }]);
  expect(await store.repository.authorize(store.transaction, actor)).toBe(true);
  expect(mocks.admin).toHaveBeenCalledWith(actor.userId);
  expect(store.locks).toEqual([{ table: adminAccounts, mode: 'update' }]);
});
it.each([false, null])(
  'ACC-004: non-Root or missing live authority %s cannot modify the directory',
  async (root) => {
    const store = fixture();
    store.enqueue(adminAccounts, root === null ? [] : [{ id: actor.userId }]);
    mocks.admin.mockResolvedValue(
      root === null ? null : { isRoot: false, roles: ['verification'] },
    );
    await expect(store.repository.authorize(store.transaction, actor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(store.writes).toHaveLength(0);
  },
);
it('ACC-002: explicit publication records approval provenance and safe parameterized coordinates', async () => {
  const store = fixture();
  store.enqueue(cities, [{ id: cityId }]);
  const result = await store.repository.save(store.transaction, actor, input);
  expect(result).toMatchObject({ publicApproved: true, isActive: true });
  const write = store.writes.find((row) => row.table === places);
  expect(write?.value).toMatchObject({
    publicApprovedAt: now,
    publicApprovedByUserId: actor.userId,
    type: 'university',
  });
  const location =
    write?.value && typeof write.value === 'object'
      ? Reflect.get(write.value, 'location')
      : undefined;
  expect(location).toBeDefined();
  if (location) expect(new PgDialect().sqlToQuery(location).params).toEqual([73.04, 33.68]);
  expect(store.writes.find((row) => row.table === placeAliases)?.value).toEqual([
    { placeId: result.id, alias: 'University alias' },
  ]);
  expect(store.record).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({ actorRole: 'root', targetId: result.id }),
  );
});
it('ACC-002: withdrawing a directory entry clears publication without hard-deleting its identity', async () => {
  const store = fixture();
  store.enqueue(cities, [{ id: cityId }]);
  store.enqueue(areas, [{ id: areaId }]);
  store.enqueue(places, [
    { id: placeId, revision: '0', publicApprovedAt: null, publicApprovedByUserId: null },
  ]);
  store.enqueue(places, [{ revision: '0' }]);
  const { changeReason: _reason, reapprove: _review, ...snapshot } = input;
  void _reason;
  void _review;
  store.enqueue(places, [snapshot]);
  store.enqueue(
    placeAliases,
    input.aliases.map((alias) => ({ alias })),
  );
  await store.repository.save(
    store.transaction,
    actor,
    { ...input, areaId, publicApproved: false, aliases: [], expectedRevision: '0' },
    placeId,
  );
  expect(store.writes.find((row) => row.table === places)?.value).toMatchObject({
    publicApprovedAt: null,
    publicApprovedByUserId: null,
  });
  expect(store.writes.some((row) => row.table === placeAliases)).toBe(false);
});
it('ACC-002: inactive or absent city cannot be publicly approved', async () => {
  const store = fixture();
  store.enqueue(cities, []);
  await expect(store.repository.save(store.transaction, actor, input)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(store.writes).toHaveLength(0);
});
it('ACC-002: an area outside the selected city cannot be attached', async () => {
  const store = fixture();
  store.enqueue(cities, [{ id: cityId }]);
  store.enqueue(areas, []);
  await expect(
    store.repository.save(store.transaction, actor, { ...input, areaId }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toHaveLength(0);
});
it('ACC-002: unknown or non-university identity cannot be updated as a university', async () => {
  const store = fixture();
  store.enqueue(cities, [{ id: cityId }]);
  store.enqueue(places, []);
  await expect(
    store.repository.save(store.transaction, actor, input, placeId),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(store.writes).toHaveLength(0);
});

it('GEO-003: stale institution revision rejects the write before mutation or audit', async () => {
  const store = fixture();
  store.enqueue(cities, [{ id: cityId }]);
  store.enqueue(places, [
    {
      id: placeId,
      revision: '8',
      publicApprovedAt: null,
      publicApprovedByUserId: null,
    },
  ]);
  store.enqueue(places, [{ revision: '8' }]);

  await expect(
    store.repository.save(store.transaction, actor, { ...input, expectedRevision: '7' }, placeId),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });

  expect(store.writes).toHaveLength(0);
  expect(store.record).not.toHaveBeenCalled();
});
