import { expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { marketplaceQuerySchema } from '@hsm/contracts';
import type { ListingReader } from './listing-query.js';
import { publicDiscoveryQuery } from './discovery-query.js';
const database = drizzle(async () => {
  throw new Error('SQL construction must not execute');
}) as unknown as ListingReader;
const now = new Date('2026-10-17T10:00:00Z'),
  branch = '019a1234-1234-7123-8123-123456789abc';
function statement(input: Record<string, unknown> = {}) {
  return publicDiscoveryQuery(
    database,
    marketplaceQuerySchema.parse(input),
    now,
    5000,
    'private-catalog',
  ).toSQL();
}
it('ACC-002 / PERF: one bounded parent snapshot uses LATERAL aggregates, one cover and no undated claim reads', () => {
  const query = statement();
  expect(query.sql.match(/left join lateral/g)).toHaveLength(3);
  expect(query.params.filter((value) => value === 21)).toHaveLength(2);
  expect(query.params).toContain(101);
  expect(query.params).toContain(1);
  expect(query.sql).toContain('union all');
  expect(query.sql).toContain('min(');
  expect(query.sql).not.toContain('summary_claim');
  expect(query.sql).toContain('jsonb_agg');
  expect(query.sql).toContain('listing_hidden_at');
  expect(query.params).toContain('approved');
  expect(query.params).toContain(true);
});
it('ACC-004 / SEC-003: every child aggregate correlates a qualified actual parent UUID', () => {
  const query = statement({ moveInDate: '2026-10-20', moveOutDate: '2026-11-20' });
  expect(query.sql.match(/"summary_room"\."branch_id" = "marketplace_page"\."id"/g)).toHaveLength(
    2,
  );
  expect(query.sql.match(/"summary_claim"\."branch_id" = "marketplace_page"\."id"/g)).toHaveLength(
    2,
  );
  expect(query.sql).toContain('"branch_amenities"."branch_id" = "marketplace_page"."id"');
  expect(query.sql).toContain('"listing_media"."branch_id" = "marketplace_page"."id"');
  const projection = query.sql.slice(0, query.sql.indexOf(' from '));
  expect(projection).not.toMatch(
    /customer|occupant|cnic|seat_id|room_id|public_phone|public_email|address_line|audit|revision/,
  );
});
it('ACC-001 / BKG-006: dated availability retains half-open overlap, live expiry and whole-room/bed conflicts', () => {
  const query = statement({
    moveInDate: '2026-10-20',
    moveOutDate: '2026-11-20',
    availableOnly: 'true',
  });
  for (const predicate of [
    'released_at',
    'expires_at',
    'move_in_date',
    'move_out_date',
    'seat_id',
    'not exists',
    'filter (where',
  ])
    expect(query.sql).toContain(predicate);
  expect(query.params).toContain(now.toISOString());
  expect(query.params).toContain('2026-10-20');
  expect(query.params).toContain('2026-11-20');
  expect(query.sql).toContain(' < ');
  expect(query.sql).toContain(' > ');
  for (const mode of ['per_bed', 'both', 'whole_room', 'active', 'inactive', 'maintenance'])
    expect(query.params).toContain(mode);
});
it('ROOM-003 / SEC-003: summary cover uses the same clean-file eligibility as public gallery', () => {
  const query = statement();
  for (const value of [
    'clean',
    'listing_photo',
    'private',
    'private-catalog',
    'image/jpeg',
    'image/png',
    'image/webp',
    '8000000',
  ])
    expect(query.params.map(String)).toContain(value);
  expect(query.sql).toContain('octet_length');
  expect(query.sql).toContain('sha256');
});
it('ACC-002 / BKG-004: price filters, selected IDs and cursor remain bound values, never floating arithmetic', () => {
  const query = statement({
    ids: branch,
    cursor: branch,
    minimumRentPaisa: 1800001,
    maximumRentPaisa: 3200000,
  });
  expect(query.params).toContain(branch);
  expect(query.params.map(String)).toContain('1800001');
  expect(query.params.map(String)).toContain('3200000');
  expect(query.sql).not.toContain(branch);
  expect(query.sql).not.toContain('1800001');
  expect(query.sql).not.toMatch(/double precision|::float|::real/);
});
