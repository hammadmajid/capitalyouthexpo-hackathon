import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { bookingPolicies, bookings, files, rooms } from '@hsm/db';
import { bookingQuoteSnapshotSchema, holdResponseSchema } from '@hsm/contracts';
import { verifiedKey } from '@hsm/files';
import { phaseTwoFixture, fixturePolicy, fixtureLimits } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
let time = new Date('2026-10-15T10:00:00Z').getTime();
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date(time), () => new Date(time));
  await fixture.connection.db.transaction(async (database) => {
    await database
      .update(bookingPolicies)
      .set({ isCurrent: false })
      .where(eq(bookingPolicies.id, fixture.policyId));
    await database.insert(bookingPolicies).values({
      id: randomUUID(),
      policy: { ...fixturePolicy, holdSeconds: 60, requiredDocuments: ['student_id'] },
      platformLimits: fixtureLimits,
      isCurrent: true,
      createdByUserId: fixture.ownerId,
    });
  });
});
afterAll(async () => {
  await fixture?.close();
});
function headers() {
  return { authorization: `Bearer ${fixture.customerAToken}`, 'Idempotency-Key': randomUUID() };
}
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
  const quote = bookingQuoteSnapshotSchema.parse(response.json());
  const held = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/holds`,
    headers: headers(),
    payload: { quote },
  });
  expect(held.statusCode).toBe(201);
  const hold = holdResponseSchema.parse(held.json());
  const fileId = randomUUID(),
    bytes = Buffer.from('Private lock-wait document fixture');
  const objectKey = verifiedKey('resident_document', fileId);
  // Pre-scanned private fixture; scanner acceptance suites stay unchanged.
  await fixture.storage.storage.putVerified(objectKey, 'application/pdf', bytes);
  await fixture.connection.db.insert(files).values({
    id: fileId,
    uploadedBy: fixture.customerA,
    bucket: fixture.storage.bucket,
    visibility: 'private',
    objectKey,
    purpose: 'resident_document',
    scanStatus: 'clean',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(bytes.length),
    sha256: createHash('sha256').update(bytes).digest(),
  });
  return { inventory, hold, fileId };
}
it.each(['room', 'file'] as const)(
  'ACC-001 / BKG-001: a real PostgreSQL %s lock wait cannot consume an expired hold',
  async (target) => {
    const { inventory, hold, fileId } = await prepare();
    let acquired!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = fixture.connection.db.transaction(async (database) => {
      if (target === 'room')
        await database.select().from(rooms).where(eq(rooms.id, inventory.roomId)).for('update');
      else await database.select().from(files).where(eq(files.id, fileId)).for('update');
      acquired();
      await gate;
    });
    await Promise.race([ready, blocker]);
    const pending = Promise.resolve(
      fixture.application.inject({
        method: 'POST',
        url: `/v1/marketplace/${inventory.branchId}/bookings`,
        headers: headers(),
        payload: {
          quote: hold.quote,
          holdId: hold.id,
          documents: [{ kind: 'student_id', fileId }],
        },
      }),
    );
    try {
      // Observe the actual engine wait, without sleeping through the hold TTL.
      await expect
        .poll(
          async () => {
            const rows = await fixture.connection.db.execute<{ waiting: boolean }>(sql`
          select exists (select 1 from pg_stat_activity
            where datname = current_database() and pid <> pg_backend_pid()
              and wait_event_type = 'Lock') as waiting`);
            return rows[0]?.waiting;
          },
          { timeout: 5000 },
        )
        .toBe(true);
      time = new Date(hold.expiresAt).getTime() + 1;
    } finally {
      release();
      await blocker;
      await pending;
    }
    const response = await pending;
    expect(response.statusCode).toBe(409);
    const persisted = await fixture.connection.db
      .select()
      .from(bookings)
      .where(eq(bookings.branchId, inventory.branchId));
    expect(persisted).toHaveLength(0);
  },
);

it('ACC-001 / BKG-001: the same real hold path succeeds before its deadline', async () => {
  const { inventory, hold, fileId } = await prepare();
  const response = await fixture.application.inject({
    method: 'POST',
    url: `/v1/marketplace/${inventory.branchId}/bookings`,
    headers: headers(),
    payload: { quote: hold.quote, holdId: hold.id, documents: [{ kind: 'student_id', fileId }] },
  });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toHaveProperty('state', 'confirmed');
});
