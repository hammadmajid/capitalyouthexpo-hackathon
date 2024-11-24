import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { bookingPolicies, bookings, inventoryClaims, lockInventoryBranch, rooms } from '@hsm/db';
import {
  bookingQuoteSnapshotSchema,
  bookingSummarySchema,
  holdResponseSchema,
} from '@hsm/contracts';
import { lockActor } from '../../src/auth/actor-lock.js';
import { phaseTwoFixture, fixturePolicy, fixtureLimits } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
  await fixture.connection.db.transaction(async (transaction) => {
    await transaction
      .update(bookingPolicies)
      .set({ isCurrent: false })
      .where(eq(bookingPolicies.id, fixture.policyId));
    await transaction.insert(bookingPolicies).values({
      id: randomUUID(),
      policy: { ...fixturePolicy, bookingMode: 'request' },
      platformLimits: fixtureLimits,
      isCurrent: true,
      createdByUserId: fixture.ownerId,
    });
  });
});
afterAll(async () => {
  await fixture?.close();
});
function gate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return { promise, release: () => release() };
}
function headers(token: string) {
  return { authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() };
}
async function prepare() {
  const inventory = await fixture.inventory();
  const quoted = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(quoted.statusCode).toBe(200);
  const quote = bookingQuoteSnapshotSchema.parse(quoted.json());
  const held = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/holds`,
    headers: headers(fixture.customerAToken),
    payload: { quote },
  });
  expect(held.statusCode).toBe(201);
  const hold = holdResponseSchema.parse(held.json());
  const created = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/bookings`,
    headers: headers(fixture.customerAToken),
    payload: { quote: hold.quote, holdId: hold.id, documents: [] },
  });
  expect(created.statusCode).toBe(201);
  const booking = bookingSummarySchema.parse(created.json());
  expect(booking.state).toBe('pending_request');
  return { inventory, booking };
}
async function waitForIdentityWait() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await fixture.connection.db.execute(sql`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()
        and wait_event_type = 'Lock' and query ilike ${'%users%'}
    `);
    const result = z
      .array(z.object({ waiting: z.number().int().nonnegative() }).strict())
      .parse(rows);
    if ((result[0]?.waiting ?? 0) > 0) return;
    await delay(20);
  }
  throw new Error('Confirmation did not reach the controlled identity wait');
}
it('ACC-001 SEC-003: real Customer identity/inventory work and staff HTTP confirmation both commit without reversed identity locks', async () => {
  const value = await prepare(),
    actor = await fixture.service.authenticate(fixture.customerAToken);
  const acquired = gate(),
    continueInventory = gate();
  const customerWork = fixture.connection.db.transaction(async (transaction) => {
    await lockActor(transaction, actor, () => fixture.now);
    acquired.release();
    await continueInventory.promise;
    await lockInventoryBranch(transaction, value.inventory.branchId);
    await transaction
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.id, value.inventory.roomId))
      .for('update');
  });
  await Promise.race([acquired.promise, customerWork]);
  const confirmation = Promise.resolve(
    fixture.application.inject({
      method: 'POST',
      url: `/v1/branches/${value.inventory.branchId}/bookings/${value.booking.id}/confirm`,
      headers: headers(fixture.ownerToken),
      payload: { reason: 'Confirm eligible request' },
    }),
  );
  try {
    // Observe the actual server wait, then let Customer work take inventory locks.
    // Old inventory -> Customer ordering creates a real cycle at this barrier.
    await waitForIdentityWait();
    continueInventory.release();
    const [, response] = await Promise.all([customerWork, confirmation]);
    expect(response.statusCode).toBe(200);
    expect(bookingSummarySchema.parse(response.json()).state).toBe('confirmed');
    expect(response.body).not.toContain(fixture.customerA);
    const [stored] = await fixture.connection.db
      .select({ state: bookings.state })
      .from(bookings)
      .where(eq(bookings.id, value.booking.id));
    expect(stored?.state).toBe('confirmed');
    const claims = await fixture.connection.db
      .select({ id: inventoryClaims.id })
      .from(inventoryClaims)
      .where(
        and(eq(inventoryClaims.bookingId, value.booking.id), isNull(inventoryClaims.releasedAt)),
      );
    expect(claims).toHaveLength(1);
  } finally {
    continueInventory.release();
    await Promise.allSettled([customerWork, confirmation]);
  }
});
