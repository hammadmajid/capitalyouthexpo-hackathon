import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { amenities, organizations } from '@hsm/db';
import { listingFieldsSchema, customAmenitySchema, customAmenityPageSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-11-02T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
it('LIST-001 / ACC-002: owner-scoped custom amenities persist, reject duplicates and archive without deleting', async () => {
  const item = await f.inventory();
  const url = `/v1/branches/${item.branchId}/listing/custom-amenities`;
  const headers = { authorization: 'Bearer ' + f.ownerToken };
  const write = (payload: unknown) =>
    f.application.inject({
      method: 'POST',
      url,
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      payload: payload as Record<string, unknown>,
    });
  const created = await write({ kind: 'create', name: 'Study lounge', category: 'facilities' });
  expect(created.statusCode, created.body).toBe(200);
  const row = customAmenitySchema.parse(created.json());
  expect(row.organizationId).toBe(f.organizationId);
  expect(
    (await write({ kind: 'create', name: 'study lounge', category: 'other' })).statusCode,
  ).toBe(409);
  const response = await f.application.inject({ url, headers });
  expect(response.statusCode, response.body).toBe(200);
  expect(customAmenityPageSchema.parse(response.json()).data).toContainEqual(row);
  const foreignOrg = randomUUID();
  await f.connection.db
    .insert(organizations)
    .values({ id: foreignOrg, ownerUserId: f.customerA, name: 'Foreign organization' });
  await f.connection.db
    .insert(amenities)
    .values({
      code: 'custom_foreign',
      name: 'Foreign offering',
      organizationId: foreignOrg,
      isActive: true,
    });
  const listingUrl = `/v1/branches/${item.branchId}/listing`;
  const listingResponse = await f.application.inject({ url: listingUrl, headers });
  expect(listingResponse.statusCode).toBe(200);
  const listing = listingResponse.json() as { version: string };
  const deniedAssignment = await f.application.inject({
    method: 'PUT',
    url: listingUrl,
    headers: {
      ...headers,
      'Idempotency-Key': randomUUID(),
      'If-Match': '"' + listing.version + '"',
    },
    payload: { ...listingFieldsSchema.strip().parse(listing), amenityCodes: ['custom_foreign'] },
  });
  expect(deniedAssignment.statusCode, deniedAssignment.body).toBe(400);
  const allowedAssignment = await f.application.inject({
    method: 'PUT',
    url: listingUrl,
    headers: {
      ...headers,
      'Idempotency-Key': randomUUID(),
      'If-Match': '"' + listing.version + '"',
    },
    payload: { ...listingFieldsSchema.strip().parse(listing), amenityCodes: [row.code] },
  });
  expect(allowedAssignment.statusCode, allowedAssignment.body).toBe(200);
  const publicCatalog = await f.application.inject({ url: '/v1/marketplace/amenities?limit=100' });
  expect(publicCatalog.body).not.toContain(row.code);
  const denied = await f.application.inject({
    method: 'POST',
    url,
    headers: { authorization: 'Bearer ' + f.customerAToken, 'Idempotency-Key': randomUUID() },
    payload: { kind: 'create', name: 'Denied amenity', category: 'other' },
  });
  expect(denied.statusCode).toBe(403);
  const edited = await write({
    kind: 'edit',
    code: row.code,
    version: row.version,
    name: 'Quiet study lounge',
    category: 'facilities',
  });
  expect(edited.statusCode, edited.body).toBe(200);
  const current = customAmenitySchema.parse(edited.json());
  expect(
    (await write({ kind: 'archive', code: row.code, version: row.version, reason: 'Stale' }))
      .statusCode,
  ).toBe(412);
  const archived = await write({
    kind: 'archive',
    code: row.code,
    version: current.version,
    reason: 'No longer offered',
  });
  expect(archived.statusCode, archived.body).toBe(200);
  expect(customAmenitySchema.parse(archived.json()).isActive).toBe(false);
});
