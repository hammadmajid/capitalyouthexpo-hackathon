import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createDatabase } from '@hsm/db';
import { marketplaceQuerySchema } from '@hsm/contracts';
import { marketplaceCondition } from './query.js';
const connection = createDatabase('postgres://offline:offline@127.0.0.1:1/offline');
const now = new Date('2026-10-14T12:00:00Z');
afterAll(async () => {
  await connection.close();
});
function compile(input: unknown) {
  const condition = marketplaceCondition(
    connection.db,
    marketplaceQuerySchema.parse(input),
    now,
    5000,
  );
  if (!condition) throw new Error('Public predicate missing');
  return new PgDialect().sqlToQuery(condition);
}
it('ACC-002: every public search retains approval, withdrawal, archive and active-city predicates', () => {
  const query = compile({});
  expect(query.params).toContain('approved');
  for (const column of ['verification_status', 'listing_hidden_at', 'archived_at', 'is_active'])
    expect(query.sql).toContain(column);
  expect(query.sql).not.toContain('inventory_claims');
  expect(query.sql).not.toContain('customer_profiles');
  expect(query.sql).not.toContain('cnic');
});
it('ACC-002: wildcard and backslash text is literal data, never executable SQL', () => {
  const text = String.raw`A\B%_`;
  const query = compile({ q: text });
  expect(query.params).toContain(String.raw`%A\\B\%\_%`);
  const hostile = "'; DROP TABLE users; --";
  const hostileQuery = compile({ q: hostile });
  expect(hostileQuery.sql).not.toContain(hostile);
  expect(hostileQuery.params).toContain('%' + hostile + '%');
});
it('ACC-002 BKG-003: date-filtered availability considers whole-room conflicts and expired claims', () => {
  const query = compile({
    availableOnly: 'true',
    moveInDate: '2026-10-15',
    moveOutDate: '2026-11-15',
    minimumRentPaisa: 1,
    maximumRentPaisa: 5000000,
  });
  for (const column of [
    'inventory_claims',
    'released_at',
    'expires_at',
    'seat_id',
    'move_in_date',
    'move_out_date',
  ])
    expect(query.sql).toContain(column);
  expect(query.sql).toContain('not exists');
  expect(query.params).toContain('2026-10-15');
  expect(query.params).toContain('2026-11-15');
});
it('ACC-002: IDs, institutional aliases, amenities, price and map bounds remain parameterized', () => {
  const id = randomUUID();
  const query = compile({
    ids: id,
    cursor: id,
    cityId: id,
    areaId: id,
    category: 'boys',
    universityPlaceId: id,
    radiusMeters: 2500,
    q: 'NUST',
    amenities: 'wifi,mess',
    minimumRentPaisa: 1800000,
    maximumRentPaisa: 3200000,
    west: 72,
    east: 74,
    south: 32,
    north: 34,
  });
  expect(query.sql).not.toContain(id);
  expect(query.params).toContain(id);
  expect(query.params).toContain('wifi');
  expect(query.params).toContain('mess');
  expect(query.sql).toContain('ST_DWithin');
  expect(query.sql).toContain('ST_MakeEnvelope');
  expect(query.sql).toContain('place_aliases');
});

it('ACC-002: retired amenities cannot satisfy a public search filter through retained branch links', () => {
  const query = compile({ amenities: 'wifi' });
  expect(query.sql).toContain('"amenities"."is_active"');
  expect(query.params).toContain('wifi');
});
