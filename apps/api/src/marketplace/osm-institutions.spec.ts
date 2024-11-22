import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { parseOsmInstitutions } from './osm-institutions.js';
import { InstitutionImportRepository, slugFor } from './institution-import.repository.js';
import type { InstitutionRepository } from './directory.repository.js';
import type { Transaction } from '../audit/writer.js';
const payload = {
  elements: [
    { type: 'area', id: 3600000001, tags: { name: 'Islamabad Capital Territory' } },
    {
      type: 'way',
      id: 11,
      center: { lat: 33.64, lon: 72.99 },
      tags: {
        amenity: 'university',
        name: 'National University of Sciences and Technology',
        short_name: 'NUST',
        alt_name: 'NUST H-12;NUST',
        'addr:street': 'Srinagar Highway',
        'addr:suburb': 'H-12',
      },
    },
    {
      type: 'node',
      id: 12,
      lat: 33.7,
      lon: 73.0,
      tags: { amenity: 'college', name: '  F.G.  College ' },
    },
    {
      type: 'node',
      id: 13,
      lat: 33.7,
      lon: 73.0,
      tags: { amenity: 'college', name: 'FG College' },
    },
    { type: 'node', id: 14, lat: 33.7, lon: 73.0, tags: { amenity: 'school', name: 'A School' } },
    { type: 'node', id: 17, lat: 33.7, lon: 73.0, tags: { amenity: 'bench', name: 'Bench' } },
    { type: 'node', id: 18, lat: 33.69, lon: 73.01, tags: { place: 'suburb', name: 'G-10' } },
    { type: 'node', id: 19, lat: 33.71, lon: 73.05, tags: { amenity: 'fast_food', name: 'KFC' } },
    { type: 'node', id: 20, lat: 33.6, lon: 73.07, tags: { amenity: 'fast_food', name: 'KFC' } },
    { type: 'node', id: 15, lat: 33.7, lon: 73.0, tags: { amenity: 'university' } },
    { type: 'way', id: 16, tags: { amenity: 'university', name: 'No point' } },
  ],
};
it('CHG-032/033: OpenStreetMap places are categorized; unnamed, pointless, unknown and repeated ones are dropped', () => {
  const found = parseOsmInstitutions(payload);
  expect(found.map((item) => [item.type, item.name])).toEqual([
    ['university', 'National University of Sciences and Technology'],
    ['university', 'F.G. College'],
    ['school', 'A School'],
    ['locality', 'G-10'],
    ['food', 'KFC'],
    ['food', 'KFC'],
  ]);
  expect(found[0]).toMatchObject({
    sourceRef: 'way/11',
    shortName: 'NUST',
    address: 'Srinagar Highway, H-12',
    aliases: ['NUST H-12'],
    latitude: 33.64,
    longitude: 72.99,
  });
  expect(() => parseOsmInstitutions({ elements: [{ type: 'node', id: -1 }] })).toThrow();
});
function store(existing: boolean) {
  const writes: { table: unknown; values: unknown }[] = [];
  const database = {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = Promise.resolve([{ id: 'city' }]);
          return Object.assign(rows, {
            limit: () => Promise.resolve(existing ? [{ id: 'place' }] : []),
          });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        writes.push({ table, values });
        return Object.assign(Promise.resolve(), { onConflictDoNothing: () => Promise.resolve() });
      },
    }),
  };
  return { database: database as unknown as Transaction, writes };
}
const actor = { userId: '01900000-0000-7000-8000-000000000001', sessionId: 's' };
const roots = (allowed: boolean) =>
  ({
    authorize: vi.fn(async () => {
      if (!allowed) throw new DomainError('FORBIDDEN', 403, 'Root directory scope required');
      return true;
    }),
  }) as unknown as InstitutionRepository;
it('CHG-032 ACC-006: imported places are approved, aliased and audited; reruns skip them', async () => {
  const audit = { platform: vi.fn(async () => undefined) };
  const now = new Date('2026-11-14T00:00:00Z');
  const fresh = store(false);
  const importer = new InstitutionImportRepository(audit as never, () => now, roots(true));
  const items = parseOsmInstitutions(payload);
  expect(await importer.import(fresh.database, actor, 'islamabad', items)).toEqual({
    added: 6,
    skipped: 0,
  });
  expect(fresh.writes[0]?.values).toMatchObject({
    slug: items[0] ? slugFor(items[0]) : undefined,
    publicApprovedAt: now,
    publicApprovedByUserId: actor.userId,
    areaId: null,
  });
  expect(audit.platform).toHaveBeenCalledWith(
    fresh.database,
    expect.objectContaining({ action: 'institution.imported', actorRole: 'root' }),
  );
  const again = store(true);
  expect(await importer.import(again.database, actor, 'islamabad', items)).toEqual({
    added: 0,
    skipped: 6,
  });
  expect(again.writes).toEqual([]);
});
it('SEC-001: only an active Root admin can import institutions', async () => {
  const blocked = new InstitutionImportRepository(undefined, undefined, roots(false));
  const empty = store(false);
  await expect(blocked.import(empty.database, actor, 'islamabad', [])).rejects.toMatchObject({
    status: 403,
  });
  expect(empty.writes).toEqual([]);
});
