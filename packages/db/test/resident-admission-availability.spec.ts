import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  bookings,
  bookingHolds,
  inventoryClaims,
  inventoryBlocks,
  stays,
  lockInventoryBranch,
} from '../src/index.js';
import { requireResidentAdmissionAvailable } from '../src/resident-admission-availability.js';
import { lockResidentAdmissionTarget } from '../src/resident-admission-target.js';
import {
  inventoryHarness,
  bookingValues,
  claimValues,
  type InventoryFixture,
} from './inventory.fixture.js';
import { financeScope, financeTime } from './resident-finance.fixture.js';
import { insertAssignment, closeAssignment } from './stay-assignment.fixture.js';
const harness = inventoryHarness(),
  now = financeTime;
beforeAll(() => harness.start());
afterAll(() => harness.close());
function input(f: InventoryFixture, end: string | null = '2028-03-01', whole = false) {
  return {
    branchId: f.branchId,
    target: whole
      ? { kind: 'room', roomId: f.roomId }
      : { kind: 'bed', roomId: f.roomId, bedId: f.seatId },
    expectedLeaveDate: end,
  };
}
function run(value: ReturnType<typeof input>, clock = now) {
  return harness.database().transaction(async (tx) => {
    await lockInventoryBranch(tx, value.branchId);
    await lockResidentAdmissionTarget(tx, { branchId: value.branchId, target: value.target });
    return requireResidentAdmissionAvailable(tx, value, clock);
  });
}
async function reserve(f: InventoryFixture, start = '2028-02-01', end = '2028-03-01') {
  const booking = bookingValues(f, { moveInDate: start, moveOutDate: end });
  await harness.database().transaction(async (tx) => {
    await tx.insert(bookings).values(booking);
    await tx
      .insert(inventoryClaims)
      .values(claimValues(f, { bookingId: booking.id }, { moveInDate: start, moveOutDate: end }));
  });
}
async function block(
  f: InventoryFixture,
  seatId: string | null,
  start = '2028-02-01',
  end = '2028-03-01',
  released = false,
) {
  const id = v7(),
    releasedAt = released ? now : null;
  await harness.database().transaction(async (tx) => {
    await tx.insert(inventoryBlocks).values({
      id,
      branchId: f.branchId,
      roomId: f.roomId,
      seatId,
      moveInDate: start,
      moveOutDate: end,
      reason: 1,
      createdByUserId: f.ownerId,
      releasedAt,
    });
    await tx.insert(inventoryClaims).values({
      branchId: f.branchId,
      roomId: f.roomId,
      seatId,
      seatOrdinal: seatId === null ? null : seatId === f.seatId ? 1 : 2,
      blockId: id,
      moveInDate: start,
      moveOutDate: end,
      releasedAt,
    });
  });
}
// Actual SQL conflict-query component cases; complete admission/HTTP authority is separate.
it.each([null, '2028-03-01'])(
  'STAY-001 / RES-004: actual empty room supports finite/open-ended %s without a fabricated upper boundary',
  async (end) => {
    const f = await harness.scope();
    expect(await run(input(f, end))).toEqual({ admittedOn: '2028-02-01' });
  },
);
it.each([false, true])(
  'ACC-001: a real confirmed reservation blocks actual bed/whole-room admission %s',
  async (whole) => {
    const f = await harness.scope();
    await reserve(f);
    await expect(run(input(f, '2028-03-01', whole))).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
  },
);
it('ACC-001: real future maintenance outside a finite stay still blocks genuinely open-ended admission', async () => {
  const f = await harness.scope();
  await block(f, null, '2028-03-01', '2028-03-10');
  expect(await run(input(f))).toEqual({ admittedOn: '2028-02-01' });
  await expect(run(input(f, null))).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('RES-004: released historical claim does not reserve the actual target', async () => {
  const f = await harness.scope();
  await block(f, null, '2028-02-01', '2028-03-01', true);
  expect(await run(input(f))).toEqual({ admittedOn: '2028-02-01' });
});
it('ACC-001: a whole-room block covers every bed while another-bed block leaves this bed available', async () => {
  const f = await harness.scope();
  await block(f, f.otherSeatId);
  expect(await run(input(f))).toEqual({ admittedOn: '2028-02-01' });
  await expect(run(input(f, '2028-03-01', true))).rejects.toMatchObject({ code: 'CONFLICT' });
  const whole = await harness.scope();
  await block(whole, null);
  await expect(run(input(whole))).rejects.toMatchObject({ code: 'CONFLICT' });
});
it.each([-1, 0, 1])(
  'ACC-001: real hold expiry offset %sms is evaluated against the supplied server clock',
  async (offset) => {
    const f = await harness.scope(),
      id = v7(),
      expiresAt = new Date(now.getTime() + offset);
    await harness.database().transaction(async (tx) => {
      await tx.insert(bookingHolds).values({
        id,
        branchId: f.branchId,
        roomId: f.roomId,
        seatId: f.seatId,
        customerUserId: f.customerA,
        moveInDate: '2028-02-01',
        moveOutDate: '2028-03-01',
        expiresAt,
        createdAt: new Date(now.getTime() - 60000),
        quoteSnapshot: {},
        policyVersionId: f.policyId,
      });
      await tx
        .insert(inventoryClaims)
        .values(
          claimValues(
            f,
            { holdId: id },
            { moveInDate: '2028-02-01', moveOutDate: '2028-03-01', expiresAt },
          ),
        );
    });
    if (offset > 0) await expect(run(input(f))).rejects.toMatchObject({ code: 'CONFLICT' });
    else expect(await run(input(f))).toEqual({ admittedOn: '2028-02-01' });
  },
);
it('RES-004 / ACC-001: actual unclosed occupant blocks after the planned end until explicit assignment/claim release', async () => {
  const f = await financeScope(harness),
    id = v7(),
    later = new Date('2028-03-02T06:00:00Z');
  await harness
    .database()
    .update(stays)
    .set({ state: 'active', checkedInAt: now, version: 2 })
    .where(eq(stays.id, f.stayId));
  await insertAssignment(harness.database(), {
    id,
    branchId: f.branchId,
    stayId: f.stayId,
    roomTypeId: f.roomTypeId,
    roomId: f.roomId,
    seatId: f.seatId,
    seatOrdinal: 1,
    startedAt: now,
    reason: 'Physical occupancy fixture',
    createdByUserId: f.ownerId,
  });
  await expect(run(input(f, '2028-04-01'), later)).rejects.toMatchObject({ code: 'CONFLICT' });
  // Fixture release only; this is not a complete checkout acceptance claim.
  await closeAssignment(harness.database(), id, later);
  expect(await run(input(f, '2028-04-01'), later)).toEqual({ admittedOn: '2028-03-02' });
});
it('ACC-001: adjacent expired reservation dates do not overlap actual admission today', async () => {
  const f = await harness.scope();
  await reserve(f, '2028-01-01', '2028-02-01');
  expect(await run(input(f))).toEqual({ admittedOn: '2028-02-01' });
});
