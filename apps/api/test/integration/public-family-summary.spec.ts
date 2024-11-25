import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { branches } from '@hsm/db';
import {
  listingOverviewSchema,
  publicInventoryTypePageSchema,
  publicListingRulesPageSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-24T12:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
function paths(branchId: string) {
  const root = '/v1/marketplace/' + branchId;
  return [root, root + '/inventory/pages/room-types?limit=20', root + '/rules?limit=20'];
}
it('p.14 / ACC-002 / SEC-003: actual anonymous family-summary sources expose current published prices and no account facts', async () => {
  const inventory = await f.inventory();
  const responses = await Promise.all(
    paths(inventory.branchId).map((url) => f.application.inject({ url })),
  );
  expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
  const [overview, types, rules] = responses;
  if (!overview || !types || !rules) throw new Error('Missing public response');
  expect(listingOverviewSchema.parse(overview.json())).toMatchObject({
    branchId: inventory.branchId,
    availableBeds: null,
    availableWholeRooms: null,
    publicPhone: null,
    publicEmail: null,
  });
  expect(publicInventoryTypePageSchema.parse(types.json()).data[0]).toMatchObject({
    bedMonthlyRentPaisa: 1800000,
    roomMonthlyRentPaisa: 3200000,
    depositPaisa: 0,
  });
  expect(publicListingRulesPageSchema.parse(rules.json()).branchId).toBe(inventory.branchId);
  for (const response of responses) {
    expect(response.headers['cache-control']).toBe('no-store');
    for (const privateValue of [
      f.ownerId,
      f.customerA,
      f.customerB,
      f.ownerToken,
      f.customerAToken,
    ])
      expect(response.body).not.toContain(privateValue);
  }
});
it('p.14 / SEC-003: hidden and unapproved listings deny every direct summary source', async () => {
  const inventory = await f.inventory();
  for (const state of [
    { listingHiddenAt: f.now },
    { listingHiddenAt: null, verificationStatus: 'submitted' as const },
  ]) {
    await f.connection.db.update(branches).set(state).where(eq(branches.id, inventory.branchId));
    const results = await Promise.all(
      paths(inventory.branchId).map((url) => f.application.inject({ url })),
    );
    expect(results.map((response) => response.statusCode)).toEqual([404, 404, 404]);
    expect(results.every((response) => !response.body.includes('1800000'))).toBe(true);
  }
});
