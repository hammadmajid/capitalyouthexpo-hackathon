import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  residents,
  stays,
  stayAssignments,
  inventoryClaims,
  managerAssignments,
  managerInventoryGrants,
  customerProfiles,
} from '@hsm/db';
import { stayDetailSchema, stayPageSchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-18T10:00:00.000Z'));
});
afterAll(async () => {
  await fixture?.close();
});
function headers(token = fixture.ownerToken) {
  return { authorization: 'Bearer ' + token };
}
async function seed(
  branch: Awaited<ReturnType<typeof fixture.inventory>>,
  userId: string | null = null,
  name = 'Private Resident',
) {
  const residentId = randomUUID(),
    stayId = randomUUID(),
    assignmentId = randomUUID();
  await fixture.connection.db.transaction(async (transaction) => {
    await transaction.insert(residents).values({
      id: residentId,
      branchId: branch.branchId,
      userId,
      displayName: name,
      phone: '+923001234567',
      email: 'resident@example.com',
      createdByUserId: fixture.ownerId,
    });
    await transaction.insert(stays).values({
      id: stayId,
      branchId: branch.branchId,
      residentId,
      userId,
      source: 'manual',
      state: 'active',
      moveInDate: '2026-10-18',
      expectedLeaveDate: '2026-11-18',
      checkedInAt: fixture.now,
      createdByUserId: fixture.ownerId,
    });
    await transaction.insert(stayAssignments).values({
      id: assignmentId,
      branchId: branch.branchId,
      stayId,
      roomTypeId: branch.roomTypeId,
      roomId: branch.roomId,
      seatId: branch.seatId,
      seatOrdinal: 1,
      startedAt: fixture.now,
      reason: 'Test actual residency',
      createdByUserId: fixture.ownerId,
    });
    await transaction.insert(inventoryClaims).values({
      branchId: branch.branchId,
      roomId: branch.roomId,
      seatId: branch.seatId,
      seatOrdinal: 1,
      assignmentId,
      moveInDate: '2026-10-18',
      moveOutDate: '2026-11-18',
    });
  });
  return { stayId, residentId, assignmentId };
}
it('RES-002 / SEC-003: real scoped directory joins actual current assignment without disclosing contacts in lists', async () => {
  const branch = await fixture.inventory(),
    item = await seed(branch);
  const url = '/v1/branches/' + branch.branchId + '/stays';
  expect(
    (await fixture.application.inject({ url: url + '?moveInFrom=0000-01-01', headers: headers() }))
      .statusCode,
  ).toBe(400);
  const response = await fixture.application.inject({
    url:
      url +
      '?q=Private&roomId=' +
      branch.roomId +
      '&bedId=' +
      branch.seatId +
      '&moveInFrom=2026-10-18&expectedLeaveTo=2026-11-18',
    headers: headers(),
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const page = stayPageSchema.parse(response.json());
  expect(page.data).toHaveLength(1);
  expect(page.data[0]).toMatchObject({
    id: item.stayId,
    currentAssignment: { id: item.assignmentId, bedId: branch.seatId },
  });
  expect(JSON.stringify(page)).not.toContain('resident@example.com');
  const detail = await fixture.application.inject({
    url: url + '/' + item.stayId,
    headers: headers(),
  });
  expect(stayDetailSchema.parse(detail.json()).contact.email).toBe('resident@example.com');
  expect(
    (await fixture.application.inject({ url: url + '?q=NoMatch', headers: headers() })).json().data,
  ).toEqual([]);
});
it('ACC-004 / RES-001: actual Customer reads include only linked stays and reject foreign or unlinked relationships', async () => {
  const ownBranch = await fixture.inventory(),
    otherBranch = await fixture.inventory(),
    offlineBranch = await fixture.inventory();
  const own = await seed(ownBranch, fixture.customerA),
    other = await seed(otherBranch, fixture.customerB),
    offline = await seed(offlineBranch);
  const response = await fixture.application.inject({
    url: '/v1/me/stays',
    headers: headers(fixture.customerAToken),
  });
  expect(response.statusCode).toBe(200);
  const page = stayPageSchema.parse(response.json());
  expect(page.data.map((row) => row.id)).toEqual([own.stayId]);
  for (const id of [other.stayId, offline.stayId])
    expect(
      (
        await fixture.application.inject({
          url: '/v1/me/stays/' + id,
          headers: headers(fixture.customerAToken),
        })
      ).statusCode,
    ).toBe(404);
  expect(
    (
      await fixture.application.inject({
        url: '/v1/me/stays/' + own.stayId,
        headers: headers(fixture.customerAToken),
      })
    ).statusCode,
  ).toBe(200);
});
it('ACC-004: branch guesses never expose another Stay even to the owning Owner of both branches', async () => {
  const a = await fixture.inventory(),
    b = await fixture.inventory(),
    item = await seed(a);
  const response = await fixture.application.inject({
    url: '/v1/branches/' + b.branchId + '/stays/' + item.stayId,
    headers: headers(),
  });
  expect(response.statusCode).toBe(404);
  expect(JSON.stringify(response.json())).not.toContain('Private Resident');
});
it('ACC-004 / MGR-004: persisted grants remain default-deny and revocation immediately removes private resident access', async () => {
  const branch = await fixture.inventory(),
    item = await seed(branch),
    assignmentId = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: branch.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'booking_manage' });
  const url = '/v1/branches/' + branch.branchId + '/stays/' + item.stayId;
  expect(
    (await fixture.application.inject({ url, headers: headers(fixture.customerBToken) }))
      .statusCode,
  ).toBe(403);
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'stay_manage' });
  expect(
    (await fixture.application.inject({ url, headers: headers(fixture.customerBToken) }))
      .statusCode,
  ).toBe(200);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated' })
    .where(eq(managerAssignments.id, assignmentId));
  expect(
    (await fixture.application.inject({ url, headers: headers(fixture.customerBToken) }))
      .statusCode,
  ).toBe(403);
});
it('RES-002 / SEC-003: literal name wildcard does not enumerate the whole private directory', async () => {
  const branch = await fixture.inventory();
  await seed(branch, null, 'Literal %_Name');
  const url = '/v1/branches/' + branch.branchId + '/stays';
  const hit = await fixture.application.inject({ url: url + '?q=%25_', headers: headers() });
  expect(hit.statusCode).toBe(200);
  expect(stayPageSchema.parse(hit.json()).data).toHaveLength(1);
  const miss = await fixture.application.inject({ url: url + '?q=%25any', headers: headers() });
  expect(miss.statusCode).toBe(200);
  expect(stayPageSchema.parse(miss.json()).data).toHaveLength(0);
});

it('RES-001 / CHG-009 / ACC-004: a real Owner with no Customer profile reads only the Stay explicitly linked to that same account', async () => {
  const ownBranch = await fixture.inventory(),
    otherBranch = await fixture.inventory();
  const ownStay = await seed(ownBranch, fixture.ownerId, 'Owner who is also a resident'),
    otherStay = await seed(otherBranch, null, 'Unlinked offline resident');
  expect(
    await fixture.connection.db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, fixture.ownerId)),
  ).toHaveLength(0);
  const page = await fixture.application.inject({ url: '/v1/me/stays', headers: headers() });
  expect(page.statusCode).toBe(200);
  expect(stayPageSchema.parse(page.json()).data.map((row) => row.id)).toEqual([ownStay.stayId]);
  expect(
    (
      await fixture.application.inject({
        url: '/v1/me/stays/' + ownStay.stayId,
        headers: headers(),
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await fixture.application.inject({
        url: '/v1/me/stays/' + otherStay.stayId,
        headers: headers(),
      })
    ).statusCode,
  ).toBe(404);
});
