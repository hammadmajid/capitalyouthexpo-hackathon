import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { branches, rooms, roomTypes, seats, lockInventoryBranch } from '../src/index.js';
import { lockResidentAdmissionTarget } from '../src/resident-admission-target.js';
import { inventoryHarness, type InventoryFixture } from './inventory.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
const target = (f: InventoryFixture) => ({ kind: 'bed', roomId: f.roomId, bedId: f.seatId });
function run(branchId: string, input: unknown) {
  return harness.database().transaction(async (tx) => {
    await lockInventoryBranch(tx, branchId);
    return lockResidentAdmissionTarget(tx, { branchId, target: input });
  });
}
// Actual SQL target-lock component tests; not HTTP authorization or complete admission acceptance.
it('STAY-001 / RES-004: actual private operational target works before public listing approval', async () => {
  const f = await harness.scope(),
    [branch] = await harness.database().select().from(branches).where(eq(branches.id, f.branchId));
  expect(branch?.verificationStatus).not.toBe('approved');
  expect(await run(f.branchId, target(f))).toEqual({
    branchId: f.branchId,
    roomTypeId: f.roomTypeId,
    roomId: f.roomId,
    seatId: f.seatId,
    seatOrdinal: 1,
  });
});
it('RES-004: actual whole-room target retains null bed identity rather than inventing a seat', async () => {
  const f = await harness.scope();
  expect(await run(f.branchId, { kind: 'room', roomId: f.roomId })).toMatchObject({
    roomTypeId: f.roomTypeId,
    roomId: f.roomId,
    seatId: null,
    seatOrdinal: null,
  });
});
it.each([
  { kind: 'bed', mode: 'whole_room' as const },
  { kind: 'room', mode: 'per_bed' as const },
])('RES-004: actual $kind target respects $mode', async ({ kind, mode }) => {
  const f = await harness.scope();
  await harness
    .database()
    .update(roomTypes)
    .set({ inventoryMode: mode })
    .where(eq(roomTypes.id, f.roomTypeId));
  await expect(
    run(f.branchId, kind === 'bed' ? target(f) : { kind: 'room', roomId: f.roomId }),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
});
it.each(['room', 'bed'])(
  'RES-004: actual %s maintenance cannot be bypassed by manual target selection',
  async (kind) => {
    const f = await harness.scope();
    if (kind === 'room')
      await harness
        .database()
        .update(rooms)
        .set({ status: 'maintenance' })
        .where(eq(rooms.id, f.roomId));
    else
      await harness
        .database()
        .update(seats)
        .set({ status: 'maintenance' })
        .where(eq(seats.id, f.seatId));
    await expect(run(f.branchId, target(f))).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
  },
);
it.each(['room', 'bed'])(
  'SEC-003 / ACC-002: actual foreign %s is404 beneath the supplied authorized branch scope',
  async (kind) => {
    const f = await harness.scope(),
      foreign = await harness.scope();
    const input = kind === 'room' ? target(foreign) : { ...target(f), bedId: foreign.seatId };
    await expect(run(f.branchId, input)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  },
);
it('RES-004: actual whole-room selection rejects one unavailable live bed', async () => {
  const f = await harness.scope();
  await harness
    .database()
    .update(seats)
    .set({ status: 'maintenance' })
    .where(eq(seats.id, f.otherSeatId));
  await expect(run(f.branchId, { kind: 'room', roomId: f.roomId })).rejects.toMatchObject({
    code: 'CONFLICT',
    message: 'Room contains unavailable inventory',
  });
});
it('ACC-001: actual admission target keeps its room lock until transaction completion without a timing sleep', async () => {
  const f = await harness.scope();
  let markReady: (() => void) | undefined, release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    }),
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
  const locking = harness.database().transaction(async (tx) => {
    await lockInventoryBranch(tx, f.branchId);
    const result = await lockResidentAdmissionTarget(tx, {
      branchId: f.branchId,
      target: target(f),
    });
    markReady?.();
    await hold;
    return result;
  });
  const exclusive = () =>
    harness.database().transaction((tx) =>
      tx
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.branchId, f.branchId), eq(rooms.id, f.roomId)))
        .for('update', { noWait: true }),
    );
  await Promise.race([ready, locking]);
  try {
    await expect(exclusive()).rejects.toThrow();
  } finally {
    release?.();
    await locking;
  }
  expect(await exclusive()).toEqual([{ id: f.roomId }]);
});
