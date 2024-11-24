import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  amenities,
  branchAmenities,
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import {
  privateListingSchema,
  listingDetailsSchema,
  listingPageSchema,
  amenityCatalogPageSchema,
} from '@hsm/contracts';
import { ListingRepository } from '../../src/inventory/listing.repository.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
const fields = {
  description: null,
  nearbyLandmark: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
};
const authorization = (token = fixture.ownerToken) => ({ authorization: 'Bearer ' + token });
const url = (branchId: string) => `/v1/branches/${branchId}/listing`;
async function prepare() {
  const inventory = await fixture.inventory(),
    active = 'amenity_' + randomUUID().replaceAll('-', ''),
    retired = 'amenity_' + randomUUID().replaceAll('-', '');
  await fixture.connection.db.insert(amenities).values([
    { code: active, name: 'Fixture approved amenity', isActive: true },
    { code: retired, name: 'Fixture retired amenity', isActive: false },
  ]);
  return { ...inventory, active, retired };
}
async function current(branchId: string, token = fixture.ownerToken) {
  const response = await fixture.application.inject({
    url: url(branchId),
    headers: authorization(token),
  });
  expect(response.statusCode).toBe(200);
  const value = privateListingSchema.parse(response.json()),
    etag = '"' + value.version + '"';
  expect(response.headers.etag).toBe(etag);
  expect(response.headers['cache-control']).toBe('no-store');
  return { value, etag };
}
function write(
  branchId: string,
  etag: string,
  body: unknown,
  token = fixture.ownerToken,
  key = randomUUID(),
) {
  return fixture.application.inject({
    method: 'PUT',
    url: url(branchId),
    headers: {
      ...authorization(token),
      'Content-Type': 'application/json',
      'If-Match': etag,
      'Idempotency-Key': key,
    },
    payload: JSON.stringify(body),
  });
}
it('TRUST-006 / ACC-002: real listing writes preserve private contact until explicit publication and audit one idempotent change', async () => {
  const inventory = await prepare(),
    before = await current(inventory.branchId),
    key = randomUUID(),
    body = {
      ...fields,
      description: 'Actual persisted listing',
      publicPhone: '+925112345678',
      publicEmail: 'hostel@example.test',
      amenityCodes: [inventory.active],
    };
  const response = await write(inventory.branchId, before.etag, body, fixture.ownerToken, key);
  expect(response.statusCode).toBe(200);
  const saved = privateListingSchema.parse(response.json());
  expect(saved.version).not.toBe(before.value.version);
  expect(saved).toMatchObject({
    ...fields,
    description: body.description,
    publicPhone: body.publicPhone,
    publicEmail: body.publicEmail,
    amenities: [{ code: inventory.active, isActive: true }],
  });
  const replay = await write(inventory.branchId, before.etag, body, fixture.ownerToken, key);
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  const publicRead = await fixture.application.inject({
    url: `/v1/marketplace/${inventory.branchId}`,
  });
  expect(publicRead.statusCode).toBe(200);
  expect(listingDetailsSchema.parse(publicRead.json())).toMatchObject({
    description: body.description,
    publicPhone: null,
    publicEmail: null,
  });
  const latest = await current(inventory.branchId);
  expect(
    (await write(inventory.branchId, latest.etag, { ...body, showPublicContact: true })).statusCode,
  ).toBe(200);
  const published = await fixture.application.inject({
    url: `/v1/marketplace/${inventory.branchId}`,
  });
  expect(listingDetailsSchema.parse(published.json())).toMatchObject({
    publicPhone: body.publicPhone,
    publicEmail: body.publicEmail,
  });
  const audit = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, inventory.branchId),
        eq(hostelAuditLog.action, 'listing.settings.changed'),
      ),
    );
  expect(audit).toHaveLength(2);
});
it('TRUST-006 / ACC-004: concurrent real same-version edits produce one success and one 412 rather than lost updates', async () => {
  const inventory = await prepare(),
    before = await current(inventory.branchId);
  const responses = await Promise.all(
    ['First explicit edit', 'Second explicit edit'].map((description) =>
      write(inventory.branchId, before.etag, { ...fields, description, amenityCodes: [] }),
    ),
  );
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 412]);
  const winner = responses.find((response) => response.statusCode === 200);
  if (!winner) throw new Error('Persisted winner missing');
  const expected = privateListingSchema.parse(winner.json());
  expect((await current(inventory.branchId)).value).toEqual(expected);
  const audit = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, inventory.branchId),
        eq(hostelAuditLog.action, 'listing.settings.changed'),
      ),
    );
  expect(audit).toHaveLength(1);
});
it('ACC-004: real assigned Manager reads status but cannot edit without listing_edit; revocation denies successful replay', async () => {
  const inventory = await prepare(),
    foreign = await prepare(),
    assignmentId = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  const before = await current(inventory.branchId, fixture.customerBToken);
  expect(before.value.canEdit).toBe(false);
  const body = { ...fields, description: 'Manager-authorized description', amenityCodes: [] };
  expect(
    (await write(inventory.branchId, before.etag, body, fixture.customerBToken)).statusCode,
  ).toBe(403);
  expect(
    (
      await fixture.application.inject({
        url: url(foreign.branchId),
        headers: authorization(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'listing_edit', grantedAt: fixture.now });
  const permitted = await current(inventory.branchId, fixture.customerBToken);
  expect(permitted.value.canEdit).toBe(true);
  const key = randomUUID();
  expect(
    (await write(inventory.branchId, permitted.etag, body, fixture.customerBToken, key)).statusCode,
  ).toBe(200);
  await fixture.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'listing_edit'),
      ),
    );
  expect(
    (await write(inventory.branchId, permitted.etag, body, fixture.customerBToken, key)).statusCode,
  ).toBe(403);
});
it('ACC-002: real unapproved catalog codes cannot be added, and retired selected metadata cannot advertise availability through search', async () => {
  const inventory = await prepare(),
    before = await current(inventory.branchId);
  expect(
    (await write(inventory.branchId, before.etag, { ...fields, amenityCodes: [inventory.retired] }))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await write(inventory.branchId, before.etag, {
        ...fields,
        amenityCodes: ['unapproved_amenity'],
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (await write(inventory.branchId, before.etag, { ...fields, amenityCodes: [inventory.active] }))
      .statusCode,
  ).toBe(200);
  await fixture.connection.db
    .update(amenities)
    .set({ isActive: false })
    .where(eq(amenities.code, inventory.active));
  const retained = await current(inventory.branchId);
  expect(retained.value.amenities).toMatchObject([{ code: inventory.active, isActive: false }]);
  expect(
    (
      await write(inventory.branchId, retained.etag, {
        ...fields,
        description: 'Preserve historical selection',
        amenityCodes: [inventory.active],
      })
    ).statusCode,
  ).toBe(200);
  const publicRead = await fixture.application.inject({
    url: `/v1/marketplace/${inventory.branchId}`,
  });
  expect(listingDetailsSchema.parse(publicRead.json()).amenities).toEqual([]);
  const search = await fixture.application.inject({
    url: '/v1/marketplace?amenities=' + inventory.active,
  });
  expect(search.statusCode).toBe(200);
  expect(
    listingPageSchema.parse(search.json()).data.some((row) => row.branchId === inventory.branchId),
  ).toBe(false);
  const catalog = await fixture.application.inject({ url: '/v1/marketplace/amenities?limit=100' });
  expect(catalog.statusCode).toBe(200);
  expect(
    amenityCatalogPageSchema
      .parse(catalog.json())
      .data.some((row) => row.code === inventory.active || row.code === inventory.retired),
  ).toBe(false);
});
it('SEC-003 / TRUST-006: real downstream failure rolls back fields, associations and audit atomically', async () => {
  const inventory = await prepare(),
    before = await current(inventory.branchId),
    actor = await fixture.service.authenticate(fixture.ownerToken),
    repository = new ListingRepository(fixture.connection.db, undefined, () => fixture.now);
  await expect(
    fixture.connection.db.transaction(async (transaction) => {
      await repository.save(transaction, actor, inventory.branchId, before.value.version, {
        ...fields,
        description: 'Must roll back',
        amenityCodes: [inventory.active],
      });
      throw new Error('Controlled listing rollback');
    }),
  ).rejects.toThrow('Controlled listing rollback');
  expect((await current(inventory.branchId)).value).toEqual(before.value);
  expect(
    await fixture.connection.db
      .select()
      .from(branchAmenities)
      .where(eq(branchAmenities.branchId, inventory.branchId)),
  ).toHaveLength(0);
  expect(
    await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.branchId, inventory.branchId),
          eq(hostelAuditLog.action, 'listing.settings.changed'),
        ),
      ),
  ).toHaveLength(0);
});
