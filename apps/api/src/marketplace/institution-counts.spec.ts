import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { branches } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { publicInstitutionCounts } from './institution-counts.js';
it('ACC-002: institution counts retain the same approval and active-city boundaries as listings', async () => {
  const store = queryFixture(),
    placeId = randomUUID();
  store.enqueue(branches, [{ placeId, hostelCount: 2 }]);
  expect((await publicInstitutionCounts(store.transaction, [placeId], 5000)).get(placeId)).toBe(2);
  const predicate = store.predicates[0];
  if (!predicate) throw new Error('Count predicate missing');
  const query = new PgDialect().sqlToQuery(predicate.value);
  expect(query.sql).toContain('is_active');
  expect(query.sql).toContain('listing_hidden_at');
  expect(query.sql).toContain('archived_at');
  expect(query.params).toContain('approved');
});
it('ACC-002: an empty directory does not invent counts or query every hostel', async () => {
  const store = queryFixture();
  expect((await publicInstitutionCounts(store.transaction, [], 5000)).size).toBe(0);
  expect(store.predicates).toHaveLength(0);
});
