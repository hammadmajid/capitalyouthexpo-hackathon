import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users, bookings } from '@hsm/db';
import { bookingQuoteSnapshotSchema, bookingSummarySchema } from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-15T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
async function prepare() {
  const inventory = await fixture.inventory();
  const response = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/quote`,
    payload: {
      target: { kind: 'bed', roomId: inventory.roomId, bedId: inventory.seatId },
      range: { moveInDate: '2026-11-01', moveOutDate: '2026-11-03' },
    },
  });
  expect(response.statusCode).toBe(200);
  return { inventory, quote: bookingQuoteSnapshotSchema.parse(response.json()) };
}
function create(
  branchId: string,
  quote: unknown,
  token: string,
  permanentAddress?: string,
  key = randomUUID(),
) {
  return fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${branchId}/bookings`,
    headers: { authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    payload: {
      quote,
      documents: [],
      ...(permanentAddress === undefined ? {} : { permanentAddress }),
    },
  });
}
it('AUTH-C-005 / ACC-001/002: missing address rejects, the same key retries after correction, identity stays private', async () => {
  const { inventory, quote } = await prepare();
  await fixture.connection.db
    .update(users)
    .set({ permanentAddress: null })
    .where(eq(users.id, fixture.customerA));
  const key = randomUUID();
  const missing = await create(inventory.branchId, quote, fixture.customerAToken, undefined, key);
  expect(missing.statusCode).toBe(422);
  expect(missing.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  const address = 'House 12, Islamabad';
  const response = await create(inventory.branchId, quote, fixture.customerAToken, address, key);
  expect(response.statusCode).toBe(201);
  const booking = bookingSummarySchema.parse(response.json());
  expect(response.body).not.toContain(address);
  expect(booking).not.toHaveProperty('permanentAddress');
  const [identity] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, fixture.customerA));
  expect(identity?.permanentAddress).toBe(address);
  const replay = await create(inventory.branchId, quote, fixture.customerAToken, address, key);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  const rows = await fixture.connection.db
    .select()
    .from(bookings)
    .where(eq(bookings.id, booking.id));
  expect(rows).toHaveLength(1);
});
it('AUTH-C-005 / ACC-001: a conflicting booking rolls back its supplied identity change', async () => {
  const { inventory, quote } = await prepare();
  expect((await create(inventory.branchId, quote, fixture.customerAToken)).statusCode).toBe(201);
  const original = 'Existing address, Rawalpindi';
  await fixture.connection.db
    .update(users)
    .set({ permanentAddress: original })
    .where(eq(users.id, fixture.customerB));
  const conflict = await create(
    inventory.branchId,
    quote,
    fixture.customerBToken,
    'Replacement address, Islamabad',
  );
  expect(conflict.statusCode).toBe(409);
  const [identity] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, fixture.customerB));
  expect(identity?.permanentAddress).toBe(original);
});
