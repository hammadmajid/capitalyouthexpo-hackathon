import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { PropertyStructureRepository } from './property-structure.repository.js';
import { PropertyStructureService } from './property-structure.service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const buildingId = randomUUID(),
  floorId = randomUUID(),
  roomId = randomUUID();
const building = {
  id: buildingId,
  branchId,
  name: 'Main',
  sortOrder: 0,
  version: 1,
  archivedAt: null,
};
const floor = {
  id: floorId,
  branchId,
  buildingId,
  label: 'Ground',
  levelNumber: 0,
  version: 1,
  archivedAt: null,
};
const location = {
  branchId,
  roomId,
  roomLabel: '101',
  version: 2,
  canEdit: true,
  archivedAt: null,
  floor: { id: floorId, label: 'Ground', buildingId, buildingName: 'Main' },
};
const archive = { expectedVersion: 1, reason: 'Metadata archival' };
function fixture() {
  const query = queryFixture(),
    responses = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: query.transaction,
        read: async (key) => responses.get(key),
        remove: async (key) => {
          responses.delete(key);
        },
        save: async (key, response) => {
          responses.set(key, response);
        },
      }),
  };
  const repository = new PropertyStructureRepository(query.database);
  const authority = vi.spyOn(repository, 'authorize').mockResolvedValue({
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner',
  });
  const related = vi.spyOn(repository, 'authorizeRelatedFloor').mockResolvedValue({
    ...floor,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const buildingPage = vi
    .spyOn(repository, 'buildingPage')
    .mockResolvedValue({ branchId, canEdit: true, data: [building], nextCursor: null });
  const floorPage = vi
    .spyOn(repository, 'floorPage')
    .mockResolvedValue({ branchId, buildingId, canEdit: true, data: [floor], nextCursor: null });
  const read = vi.spyOn(repository, 'roomLocation').mockResolvedValue(location);
  const createBuilding = vi.spyOn(repository, 'createBuilding').mockImplementation(async (tx) => {
    expect(requireTransaction()).toBe(tx);
    return building;
  });
  const createFloor = vi.spyOn(repository, 'createFloor').mockResolvedValue(floor);
  const archiveBuilding = vi
    .spyOn(repository, 'archiveBuilding')
    .mockResolvedValue({ ...building, version: 2, archivedAt: new Date().toISOString() });
  const archiveFloor = vi
    .spyOn(repository, 'archiveFloor')
    .mockResolvedValue({ ...floor, version: 2, archivedAt: new Date().toISOString() });
  const save = vi.spyOn(repository, 'saveRoomLocation').mockResolvedValue(location);
  return {
    service: new PropertyStructureService(repository, new IdempotencyService(store)),
    query,
    responses,
    authority,
    related,
    buildingPage,
    floorPage,
    read,
    createBuilding,
    createFloor,
    archiveBuilding,
    archiveFloor,
    save,
  };
}
it('PROP / AUD-010: named reads validate and normalize their exact branch/parent scope', async () => {
  const f = fixture();
  expect(await f.service.buildings(actor, branchId.toUpperCase(), {})).toMatchObject({ branchId });
  expect(f.buildingPage).toHaveBeenCalledWith(actor, branchId, { limit: 20, view: 'active' });
  await f.service.floors(actor, branchId, { buildingId, limit: '10', view: 'all' });
  expect(f.floorPage).toHaveBeenCalledWith(actor, branchId, { buildingId, limit: 10, view: 'all' });
  expect(await f.service.room(actor, branchId, roomId.toUpperCase(), {})).toEqual(location);
  expect(() => f.service.buildings(actor, 'invalid', {})).toThrow();
  expect(() => f.service.room(actor, branchId, roomId, { extra: true })).toThrow();
});
it('ACC-004 / SEC-003 / AUD-010: commands replay one canonical write and reauthorize revoked grants', async () => {
  const f = fixture(),
    key = randomUUID(),
    body = { name: ' Main ', sortOrder: 0 };
  const first = await f.service.createBuilding(actor, key, branchId.toUpperCase(), body);
  const replay = await f.service.createBuilding(actor, key, branchId, { ...body, name: 'Main' });
  expect(first.body).toEqual(building);
  expect(replay.body).toEqual(building);
  expect(replay.replayed).toBe(true);
  expect(f.createBuilding).toHaveBeenCalledTimes(1);
  expect(f.authority).toHaveBeenCalledTimes(2);
  expect(f.responses.size).toBe(1);
  await expect(
    f.service.createBuilding(actor, key, branchId, { ...body, name: 'Changed' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  f.authority.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Grant revoked'));
  await expect(f.service.createBuilding(actor, key, branchId, body)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(f.createBuilding).toHaveBeenCalledTimes(1);
});
it('PROP / ACC-004 / AUD-010: floor, archival and room-location commands bind exact related resources', async () => {
  const f = fixture();
  expect(
    (
      await f.service.createFloor(actor, randomUUID(), branchId, {
        buildingId,
        label: 'Ground',
        levelNumber: 0,
      })
    ).body,
  ).toEqual(floor);
  expect(f.authority.mock.calls.at(-1)?.[3]).toEqual({ kind: 'building', id: buildingId });
  expect(
    (await f.service.archiveBuilding(actor, randomUUID(), branchId, buildingId, archive)).body,
  ).toMatchObject({ id: buildingId, version: 2 });
  expect(
    (await f.service.archiveFloor(actor, randomUUID(), branchId, floorId, archive)).body,
  ).toMatchObject({ id: floorId, version: 2 });
  const key = randomUUID(),
    body = { expectedVersion: 1, reason: 'Physical location', floorId };
  expect((await f.service.saveRoom(actor, key, branchId, roomId, body)).body).toEqual(location);
  expect((await f.service.saveRoom(actor, key, branchId, roomId, body)).replayed).toBe(true);
  expect(f.related).toHaveBeenCalledTimes(2);
  expect(f.related).toHaveBeenLastCalledWith(f.query.transaction, branchId, floorId);
  expect(f.save).toHaveBeenCalledTimes(1);
  await f.service.saveRoom(actor, randomUUID(), branchId, roomId, { ...body, floorId: null });
  expect(f.related).toHaveBeenCalledTimes(2);
});
it('SEC-001 / AUD-010: fabricated or invalid metadata commands never reach authority or writes', () => {
  const f = fixture();
  expect(() =>
    f.service.createBuilding(actor, randomUUID(), branchId, { name: 'x', canEdit: true }),
  ).toThrow();
  expect(() =>
    f.service.createFloor(actor, randomUUID(), branchId, {
      buildingId: 'bad',
      label: 'Ground',
      levelNumber: 0,
    }),
  ).toThrow();
  expect(() =>
    f.service.archiveBuilding(actor, randomUUID(), branchId, buildingId, {
      expectedVersion: 0,
      reason: 'x',
    }),
  ).toThrow();
  expect(() =>
    f.service.archiveFloor(actor, randomUUID(), branchId, floorId, { ...archive, reason: '' }),
  ).toThrow();
  expect(() =>
    f.service.saveRoom(actor, randomUUID(), branchId, roomId, { ...archive, floorId: 'bad' }),
  ).toThrow();
  expect(f.authority).not.toHaveBeenCalled();
  expect(f.createBuilding).not.toHaveBeenCalled();
});
