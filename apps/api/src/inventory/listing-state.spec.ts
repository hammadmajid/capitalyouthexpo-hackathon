import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { branches, branchAmenities, amenities } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  listingVersion,
  readListingState,
  projectListing,
  readAmenityCatalog,
} from './listing-state.js';
const branchId = randomUUID(),
  fields = {
    description: null,
    nearbyLandmark: null,
    publicPhone: null,
    publicEmail: null,
    showPublicContact: false,
  };
const wifi = { code: 'wifi', name: 'Wi-Fi', isActive: true },
  parking = { code: 'parking', name: 'Parking', isActive: false };
it('TRUST-006: listing revisions are deterministic across row/property order without mutating source arrays', () => {
  const selected = [wifi, parking],
    version = listingVersion(branchId, fields, selected, true);
  expect(version).toMatch(/^[a-f0-9]{64}$/);
  expect(
    listingVersion(
      branchId,
      { ...fields },
      [parking, { isActive: true, name: 'Wi-Fi', code: 'wifi' }],
      true,
    ),
  ).toBe(version);
  expect(selected).toEqual([wifi, parking]);
});
it.each(['branch', 'permission', 'text', 'publication', 'catalog'] as const)(
  'TRUST-006 / ACC-004: revision changes when %s changes',
  (change) => {
    const original = listingVersion(branchId, fields, [wifi], true);
    const current = listingVersion(
      change === 'branch' ? randomUUID() : branchId,
      change === 'text'
        ? { ...fields, description: 'Updated' }
        : change === 'publication'
          ? { ...fields, showPublicContact: true }
          : fields,
      change === 'catalog' ? [{ ...wifi, isActive: false }] : [wifi],
      change !== 'permission',
    );
    expect(current).not.toBe(original);
  },
);
it('ACC-004: private current state is scoped, canonical and bounded without raw file data', async () => {
  const store = queryFixture();
  store.enqueue(branches, [fields]);
  store.enqueue(branchAmenities, [wifi, parking]);
  const state = await readListingState(store.transaction, branchId),
    result = projectListing(branchId, state, false);
  expect(result).toMatchObject({ ...fields, branchId, canEdit: false, amenities: [parking, wifi] });
  expect(result).not.toHaveProperty('fileId');
  expect(result).not.toHaveProperty('ownerUserId');
  expect(store.operations).toContainEqual({ table: branchAmenities, kind: 'limit', args: [101] });
  expect(store.locks).toContainEqual({ table: branchAmenities, mode: 'share' });
  expect(store.predicates.map((row) => new PgDialect().sqlToQuery(row.value).params)).toEqual([
    [branchId],
    [branchId],
  ]);
});
it('ACC-004: missing branches cannot fabricate editable defaults', async () => {
  const store = queryFixture();
  await expect(readListingState(store.transaction, branchId)).rejects.toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
  });
});
it('ACC-004: an oversized retained selection fails instead of silently truncating settings', async () => {
  const store = queryFixture();
  store.enqueue(branches, [fields]);
  store.enqueue(
    branchAmenities,
    Array.from({ length: 101 }, (_, index) => ({
      code: 'amenity_' + index,
      name: 'Amenity ' + index,
      isActive: true,
    })),
  );
  await expect(readListingState(store.transaction, branchId)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});
it('ACC-002: approved catalog uses actual stable cursor rows and active-only bounded SQL', async () => {
  const store = queryFixture();
  store.enqueue(amenities, [
    { code: 'parking', name: 'Parking' },
    { code: 'wifi', name: 'Wi-Fi' },
  ]);
  expect(await readAmenityCatalog(store.transaction, { limit: 1, cursor: 'mess' })).toEqual({
    data: [{ code: 'parking', name: 'Parking' }],
    nextCursor: 'parking',
  });
  expect(store.operations).toContainEqual({ table: amenities, kind: 'limit', args: [2] });
  const sql = new PgDialect().sqlToQuery(
    store.predicates[0]?.value ??
      (() => {
        throw new Error('Predicate missing');
      })(),
  );
  expect(sql.sql).toContain('"amenities"."is_active"');
  expect(sql.params).toEqual([true, 'mess']);
});
it('ACC-002: successful empty catalog remains empty, not a guessed amenity list', async () => {
  const store = queryFixture();
  expect(await readAmenityCatalog(store.transaction, { limit: 20 })).toEqual({
    data: [],
    nextCursor: null,
  });
});
it.each([
  ['03154796657', '+923154796657'],
  ['051-1234567', '+92511234567'],
  ['+923154796657', '+923154796657'],
])(
  'TRUST-006: a contact saved during hostel setup as %s reads as %s instead of failing',
  async (stored, expected) => {
    const store = queryFixture();
    store.enqueue(branches, [{ ...fields, publicPhone: stored }]);
    store.enqueue(branchAmenities, []);
    const state = await readListingState(store.transaction, branchId);
    expect(projectListing(branchId, state, true).publicPhone).toBe(expected);
  },
);
it('TRUST-006: an unusable stored contact reads as no public phone rather than breaking setup', async () => {
  const store = queryFixture();
  store.enqueue(branches, [{ ...fields, publicPhone: '()' }]);
  store.enqueue(branchAmenities, []);
  const state = await readListingState(store.transaction, branchId);
  expect(projectListing(branchId, state, true).publicPhone).toBeNull();
});
