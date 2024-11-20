import { expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { PgDialect } from 'drizzle-orm/pg-core';
import { branches, rooms } from '../src/schema/index.js';
import {
  inventoryOptionAvailability,
  inventoryWholeRoomOperational,
} from '../src/inventory-public-policy.js';
import { hasOperationalInventoryAvailability } from '../src/inventory-operational-availability.js';
import { readPublicInventoryBranch } from '../src/inventory-public-branch.js';
import type { Database } from '../src/index.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const branchId = '10000000-0000-4000-8000-000000000001',
  roomTypeId = '10000000-0000-4000-8000-000000000002',
  now = new Date('2026-10-22T20:00:00Z');
const range = { moveInDate: '2026-10-23', moveOutDate: '2026-10-24' };
function fixture(rows: unknown[][] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = drizzle(async (statement, parameters) => {
    calls.push({ sql: statement, params: parameters });
    return { rows };
  }) as unknown as Transaction;
  return { db, calls };
}
// SQL construction/result mapping only. Real PostgreSQL locks/claims remain Phase10 cases.
it('WAIT-001 / ACC-001: undated availability remains unknown without consulting claims', () => {
  const f = fixture(),
    query = inventoryOptionAvailability(f.db, branches.id, {}, now, true);
  expect(new PgDialect().sqlToQuery(query).sql).toBe('null');
  expect(f.calls).toHaveLength(0);
});
it.each([false, true])(
  'WAIT-001 / ACC-001: shared claim predicate retains date overlap, expiry and current occupants (per-bed %s)',
  (perBed) => {
    const f = fixture(),
      query = new PgDialect().sqlToQuery(
        inventoryOptionAvailability(f.db, branches.id, range, now, perBed),
      );
    expect(query.sql).toContain('not exists');
    expect(query.sql).toContain('"inventory_claims"');
    expect(query.sql).toContain('"assignment_id" is not null');
    expect(query.sql).toContain('"released_at" is null');
    expect(query.params).toContain(range.moveInDate);
    expect(query.params).toContain(range.moveOutDate);
    expect(query.params).toContain('2026-10-23');
    expect(f.calls).toHaveLength(0);
  },
);
it('WAIT-001: whole-room eligibility keeps unarchived inactive and maintenance beds unavailable', () => {
  const f = fixture(),
    query = new PgDialect().sqlToQuery(inventoryWholeRoomOperational(f.db, branches.id, rooms.id));
  expect(query.sql).toContain('"archived_at" is null');
  expect(query.params).toContain('inactive');
  expect(query.params).toContain('maintenance');
});
it.each([false, true])(
  'WAIT-001: actual branch/type availability is one bounded query with the same operating and claim policy (typed %s)',
  async (typed) => {
    const f = fixture([[true]]);
    expect(
      await hasOperationalInventoryAvailability(
        f.db,
        branchId,
        range,
        now,
        typed ? roomTypeId : undefined,
      ),
    ).toBe(true);
    expect(f.calls).toHaveLength(1);
    const query = f.calls[0];
    expect(query?.sql).toContain('"inventory_claims"');
    expect(query?.sql).toContain('"archived_at" is null');
    expect(query?.params).toContain(branchId);
    expect(query?.params).toContain('active');
    expect(query?.params).toContain('maintenance');
    expect(query?.params).toContain(range.moveOutDate);
    expect(query?.params.includes(roomTypeId)).toBe(typed);
  },
);
it.each([{ rows: [] }, { rows: [[false]] }])(
  'WAIT-001: absent or full inventory cannot become advertised availability %#',
  async ({ rows }) => {
    const f = fixture(rows);
    expect(await hasOperationalInventoryAvailability(f.db, branchId, range, now)).toBe(false);
  },
);
it.each([false, true])(
  'WAIT-001 / SEC-003: publicity retains approved listing/live hierarchy and optional city share lock (lock %s)',
  async (lock) => {
    const f = fixture([[branchId]]);
    expect(await readPublicInventoryBranch(f.db, branchId, lock)).toEqual({ id: branchId });
    const query = f.calls[0];
    expect(query?.params).toContain('approved');
    expect(query?.sql).toContain('"listing_hidden_at" is null');
    expect(query?.sql.includes('for share of "cities"')).toBe(lock);
  },
);
