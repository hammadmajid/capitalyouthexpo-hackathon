import { expectAdmissionFinancialAndEventState } from './manual-admission-assertions.fixture.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  stays,
  residents,
  stayAgreements,
  stayAssignments,
  inventoryClaims,
  billingPolicies,
  users,
} from '../src/index.js';
import { admitManualResident } from '../src/resident-manual-admission.js';
import { inventoryHarness } from './inventory.fixture.js';
import {
  manualAdmissionScope as scope,
  manualCommand as command,
  runManualAdmission as run,
  manualAdmissionTime as now,
  manualBranchRows as rows,
} from './manual-admission.fixture.js';
const harness = inventoryHarness();
beforeAll(() => harness.start());
afterAll(() => harness.close());
// Actual full transaction composition; live HTTP/session/Manager/client acceptance is separate.
it('STAY-001 / RES-001/004 / RENT-003/004 / NTF-002: actual offline admission commits relationship, Stay, agreement, occupancy, initial finance, history, audit and recipient-free event together', async () => {
  const f = await scope(harness),
    before = await harness.database().select().from(users).orderBy(users.id),
    result = await run(harness, command(f));
  expect((await rows(harness, f.branchId)).slice(0, 9)).toEqual(Array.from({ length: 9 }, () => 1));
  expect(await harness.database().select().from(users).orderBy(users.id)).toEqual(before);
  const [stay] = await harness.database().select().from(stays).where(eq(stays.id, result.stayId));
  expect(stay).toMatchObject({
    residentId: result.residentId,
    userId: null,
    source: 'manual',
    bookingId: null,
    state: 'active',
    version: 1,
    checkedInAt: now,
  });
  const [assignment] = await harness
    .database()
    .select()
    .from(stayAssignments)
    .where(eq(stayAssignments.id, result.assignmentId));
  expect(assignment).toMatchObject({
    stayId: result.stayId,
    seatId: f.seatId,
    startedAt: now,
    endedAt: null,
  });
  const [claim] = await harness
    .database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.assignmentId, result.assignmentId));
  expect(claim).toMatchObject({
    moveInDate: '2028-02-01',
    moveOutDate: '2028-03-01',
    releasedAt: null,
  });
  await expectAdmissionFinancialAndEventState(harness, f, result);
});
it.each(['bed', 'room'])(
  'ACC-001: actual two competing %s admissions produce one complete graph and no second offline relationship',
  async (kind) => {
    const f = await scope(harness),
      value = command(f),
      manual = {
        ...value.manual,
        target: kind === 'bed' ? value.manual.target : { kind: 'room', roomId: f.roomId },
      };
    const results = await Promise.allSettled([
      run(harness, { ...value, manual }),
      run(harness, { ...value, manual }),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    expect((await rows(harness, f.branchId)).slice(0, 9)).toEqual(
      Array.from({ length: 9 }, () => 1),
    );
  },
);
it('RES-003: explicitly selected linked relationship is reused without another account or relationship', async () => {
  const f = await scope(harness),
    id = v7();
  await harness.database().insert(residents).values({
    id,
    branchId: f.branchId,
    userId: f.customerA,
    displayName: 'Explicit relationship',
    createdByUserId: f.ownerId,
  });
  const value = command(f),
    result = await run(harness, {
      ...value,
      manual: { ...value.manual, resident: { kind: 'existing', residentId: id } },
      expectedUserId: f.customerA,
    });
  expect(result.residentId).toBe(id);
  expect((await rows(harness, f.branchId))[0]).toBe(1);
  expect(
    (await harness.database().select().from(stays).where(eq(stays.id, result.stayId)))[0]?.userId,
  ).toBe(f.customerA);
});
it('RES-003 / ACC-004: actual same linked account cannot enter two hostels under concurrent separate owners', async () => {
  const first = await scope(harness),
    second = await scope(harness),
    residentA = v7(),
    residentB = v7();
  await harness
    .database()
    .insert(residents)
    .values([
      {
        id: residentA,
        branchId: first.branchId,
        userId: first.customerA,
        displayName: 'First explicit relationship',
        createdByUserId: first.ownerId,
      },
      {
        id: residentB,
        branchId: second.branchId,
        userId: first.customerA,
        displayName: 'Second explicit relationship',
        createdByUserId: second.ownerId,
      },
    ]);
  const a = command(first),
    b = command(second);
  const results = await Promise.allSettled([
    run(harness, {
      ...a,
      manual: { ...a.manual, resident: { kind: 'existing', residentId: residentA } },
      expectedUserId: first.customerA,
    }),
    run(harness, {
      ...b,
      manual: { ...b.manual, resident: { kind: 'existing', residentId: residentB } },
      expectedUserId: first.customerA,
    }),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
  expect(
    await harness.database().select().from(stays).where(eq(stays.userId, first.customerA)),
  ).toHaveLength(1);
});
it('RENT-003 / ACC-004: room-type policy admission writes the actual assignment before validating its first agreement', async () => {
  const f = await scope(harness, { typePolicy: true });
  const result = await run(harness, command(f));
  expect(result.state).toBe('active');
  expect((await rows(harness, f.branchId)).slice(0, 9)).toEqual(Array.from({ length: 9 }, () => 1));
});
it('RENT-003: actual missing current policy rejects before manual creation instead of inventing settings', async () => {
  const f = await scope(harness);
  await harness
    .database()
    .update(billingPolicies)
    .set({ isCurrent: false })
    .where(eq(billingPolicies.id, f.terms.policyVersionId));
  await expect(run(harness, command(f))).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await rows(harness, f.branchId)).toEqual(Array.from({ length: 10 }, () => 0));
});
it('FIN-004 / ACC-004: every disclosed initial fee is required, then actual rent and fee obligations commit without an invented payment', async () => {
  const f = await scope(harness, {
      fees: [{ code: 'admission', cadence: 'one_time', amountPaisa: 777 }],
      feeBilling: { oneTimeDueOffsetDays: 0 },
    }),
    value = command(f);
  await expect(run(harness, value)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(await rows(harness, f.branchId)).toEqual(Array.from({ length: 10 }, () => 0));
  await run(harness, {
    ...value,
    initialBilling: [
      ...value.initialBilling,
      { item: 'admission', cadence: 'one_time', periodIndex: 0 },
    ],
  });
  expect((await rows(harness, f.branchId)).slice(4, 8)).toEqual([2, 2, 2, 2]);
});
it('RES-004 / ACC-001: actual whole-room open-ended admission retains null bed and departure without an artificial sentinel', async () => {
  const f = await scope(harness, { openEnded: true }),
    value = command(f),
    result = await run(harness, {
      ...value,
      manual: { ...value.manual, target: { kind: 'room', roomId: f.roomId } },
    });
  const [claim] = await harness
    .database()
    .select()
    .from(inventoryClaims)
    .where(eq(inventoryClaims.assignmentId, result.assignmentId));
  expect(claim).toMatchObject({ seatId: null, seatOrdinal: null, moveOutDate: null });
  expect(
    (
      await harness
        .database()
        .select()
        .from(stayAgreements)
        .where(eq(stayAgreements.id, result.agreementId))
    )[0]?.termsSnapshot,
  ).toEqual(f.terms);
});
it('STAY-001: actual future arrival cannot create occupancy early', async () => {
  const f = await scope(harness),
    value = command(f);
  await expect(
    run(harness, {
      ...value,
      manual: { ...value.manual, period: { ...value.manual.period, moveInDate: '2028-02-02' } },
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await rows(harness, f.branchId)).toEqual(Array.from({ length: 10 }, () => 0));
});
it('SEC-003: actual missing admission authorizer cannot create a partial Stay', async () => {
  const f = await scope(harness);
  await expect(
    harness.database().transaction((tx) => admitManualResident(tx, command(f), now)),
  ).rejects.toMatchObject({ code: 'INTERNAL', status: 503 });
  expect(await rows(harness, f.branchId)).toEqual(Array.from({ length: 10 }, () => 0));
});

it.each([
  { name: 'future', expectedLeaveDate: '2028-06-01' },
  { name: 'exhausted', expectedLeaveDate: '2028-03-01' },
])(
  'RENT-003 / ACC-004: actual $name initial rent selection cannot commit an occupancy-only admission',
  async ({ expectedLeaveDate }) => {
    const f = await scope(harness),
      value = command(f);
    await expect(
      run(harness, {
        ...value,
        manual: { ...value.manual, period: { ...value.manual.period, expectedLeaveDate } },
        initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await rows(harness, f.branchId)).toEqual(Array.from({ length: 10 }, () => 0));
  },
);
it('FIN-004 / ACC-004: actual exhausted disclosed one-time fee rolls back admission rather than pretending the fee was paid', async () => {
  const f = await scope(harness, {
      fees: [{ code: 'admission', cadence: 'one_time', amountPaisa: 777 }],
      feeBilling: { oneTimeDueOffsetDays: 0 },
    }),
    value = command(f);
  await expect(
    run(harness, {
      ...value,
      initialBilling: [
        ...value.initialBilling,
        { item: 'admission', cadence: 'one_time', periodIndex: 1 },
      ],
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await rows(harness, f.branchId)).toEqual(Array.from({ length: 10 }, () => 0));
});
