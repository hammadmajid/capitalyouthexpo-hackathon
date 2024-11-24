import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { managerAssignments } from '@hsm/db';
import { inventoryBlockStateSchema, inventoryBlockPageSchema } from '@hsm/contracts';
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
it('ACC-001/004: real block history paginates, releases and retains archived inventory labels without audit reasons', async () => {
  const inventory = await fixture.inventory();
  const base = `/v1/branches/${inventory.branchId}/inventory/blocks`;
  const ids: string[] = [];
  for (const dates of [
    ['2026-11-01', '2026-11-03'],
    ['2026-11-03', '2026-11-05'],
  ] as const) {
    const response = await fixture.application.inject({
      method: 'POST',
      url: base,
      headers: headers(),
      payload: {
        target: { kind: 'room', roomId: inventory.roomId },
        range: { moveInDate: dates[0], moveOutDate: dates[1] },
        kind: 'manual',
        reason: 'Private operational fixture note',
      },
    });
    expect(response.statusCode).toBe(201);
    ids.push(inventoryBlockStateSchema.parse(response.json()).id);
  }
  const first = await fixture.application.inject({ url: base + '?limit=1', headers: headers() });
  expect(first.statusCode).toBe(200);
  expect(first.headers['cache-control']).toBe('no-store');
  const page = inventoryBlockPageSchema.parse(first.json());
  expect(page.data).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  expect(first.body).not.toContain('Private operational fixture note');
  expect(first.body).not.toContain(fixture.ownerId);
  const second = await fixture.application.inject({
    url: base + '?limit=1&cursor=' + page.nextCursor,
    headers: headers(),
  });
  const next = inventoryBlockPageSchema.parse(second.json());
  expect(next.data).toHaveLength(1);
  expect(next.nextCursor).toBeNull();
  expect(next.data[0]?.id).not.toBe(page.data[0]?.id);
  for (const id of ids)
    expect(
      (
        await fixture.application.inject({
          method: 'POST',
          url: base + '/' + id + '/release',
          headers: headers(),
          payload: { reason: 'Released fixture block' },
        })
      ).statusCode,
    ).toBe(200);
  expect(
    (
      await fixture.application.inject({
        method: 'POST',
        url: `/v1/branches/${inventory.branchId}/inventory/rooms/${inventory.roomId}/archive`,
        headers: headers(),
        payload: { reason: 'Retire fixture room' },
      })
    ).statusCode,
  ).toBe(200);
  const released = await fixture.application.inject({
    url: base + '?state=released',
    headers: headers(),
  });
  const history = inventoryBlockPageSchema.parse(released.json());
  expect(history.data).toHaveLength(2);
  expect(
    history.data.every((block) => block.roomLabel === '101' && block.releasedAt !== null),
  ).toBe(true);
  const current = await fixture.application.inject({ url: base, headers: headers() });
  expect(inventoryBlockPageSchema.parse(current.json()).data).toHaveLength(0);
});
it('ACC-004: assigned Manager may read inventory history but needs block_manage to mutate and cannot read another branch', async () => {
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
  const base = `/v1/branches/${inventory.branchId}/inventory/blocks`;
  expect(
    (await fixture.application.inject({ url: base, headers: headers(fixture.customerBToken) }))
      .statusCode,
  ).toBe(200);
  const denied = await fixture.application.inject({
    method: 'POST',
    url: base,
    headers: headers(fixture.customerBToken),
    payload: {
      target: { kind: 'room', roomId: inventory.roomId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
      kind: 'manual',
      reason: 'Unpermitted',
    },
  });
  expect(denied.statusCode).toBe(403);
  expect(
    (
      await fixture.application.inject({
        url: `/v1/branches/${foreign.branchId}/inventory/blocks`,
        headers: headers(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await fixture.application.inject({ url: base, headers: headers(fixture.customerAToken) }))
      .statusCode,
  ).toBe(403);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated' })
    .where(eq(managerAssignments.id, assignmentId));
  expect(
    (await fixture.application.inject({ url: base, headers: headers(fixture.customerBToken) }))
      .statusCode,
  ).toBe(403);
});
