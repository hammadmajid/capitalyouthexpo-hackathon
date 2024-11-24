import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { bookingPolicies, managerAssignments, managerInventoryGrants } from '@hsm/db';
import { bookingPolicyReadSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
function headers(token = fixture.ownerToken) {
  return { authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() };
}
it('BKG-006 CHG-007: real versioned writes read back inheritance, optional CNIC and isolated room scopes', async () => {
  const inventory = await fixture.inventory(),
    foreign = await fixture.inventory();
  const hostel = `/v1/owner/brands/${fixture.brandId}/booking-policy`;
  const branch = `/v1/branches/${inventory.branchId}/booking-policy`;
  const room = `/v1/branches/${inventory.branchId}/inventory/room-types/${inventory.roomTypeId}/booking-policy`;
  for (const [url, overrides] of [
    [hostel, { holdSeconds: 900, requiredDocuments: ['cnic'] }],
    [branch, { holdSeconds: 1200 }],
    [room, { holdSeconds: null, requiredDocuments: [] }],
  ] as const) {
    const response = await fixture.application.inject({
      method: 'PUT',
      url,
      headers: headers(),
      payload: { overrides },
    });
    expect(response.statusCode).toBe(200);
  }
  const response = await fixture.application.inject({ url: room, headers: headers() });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const result = bookingPolicyReadSchema.parse(response.json());
  expect(result).toMatchObject({
    configured: true,
    canEdit: true,
    effective: { holdSeconds: 1200, requiredDocuments: [] },
    inherited: { holdSeconds: 1200, requiredDocuments: ['cnic'] },
    localVersion: { level: 'room_type', scopeId: inventory.roomTypeId },
  });
  if (!result.configured) throw new Error('Expected persisted configuration');
  expect(result.lineage.map((version) => version.level)).toEqual([
    'platform',
    'hostel',
    'branch',
    'room_type',
  ]);
  const outside = await fixture.application.inject({
    url: `/v1/branches/${foreign.branchId}/inventory/room-types/${inventory.roomTypeId}/booking-policy`,
    headers: headers(),
  });
  expect(outside.statusCode).toBe(404);
  const sibling = await fixture.application.inject({
    url: `/v1/branches/${foreign.branchId}/booking-policy`,
    headers: headers(),
  });
  expect(bookingPolicyReadSchema.parse(sibling.json())).toMatchObject({
    configured: true,
    localVersion: null,
    effective: { holdSeconds: 900, requiredDocuments: ['cnic'] },
  });
  const old = await fixture.connection.db
    .select()
    .from(bookingPolicies)
    .where(eq(bookingPolicies.roomTypeId, inventory.roomTypeId));
  expect(old).toHaveLength(1);
});
it('ACC-004: real assigned Manager reads policy without edit grant; grants and revocation reflect stored state', async () => {
  const inventory = await fixture.inventory(),
    foreign = await fixture.inventory(),
    assignmentId = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  const url = `/v1/branches/${inventory.branchId}/booking-policy`;
  const read = () => fixture.application.inject({ url, headers: headers(fixture.customerBToken) });
  expect(bookingPolicyReadSchema.parse((await read()).json())).toMatchObject({ canEdit: false });
  expect(
    (
      await fixture.application.inject({
        method: 'PUT',
        url,
        headers: headers(fixture.customerBToken),
        payload: { overrides: { holdSeconds: 600 } },
      })
    ).statusCode,
  ).toBe(403);
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'policy_edit' });
  expect(bookingPolicyReadSchema.parse((await read()).json())).toMatchObject({ canEdit: true });
  expect(
    (
      await fixture.application.inject({
        url: `/v1/branches/${foreign.branchId}/booking-policy`,
        headers: headers(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated' })
    .where(eq(managerAssignments.id, assignmentId));
  expect((await read()).statusCode).toBe(403);
});
