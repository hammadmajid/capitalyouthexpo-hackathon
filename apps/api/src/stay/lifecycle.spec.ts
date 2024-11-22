import { beforeEach, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  branches,
  checkoutStay,
  extendStay,
  readPostCheckoutActivity,
  readStaySettlement,
  recordResidentFundMovement,
  stayFinalStatements,
  stays,
  transferStay,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { lockFinancialReadStay } from './financial-read-scope.js';
import { LIFECYCLE_GRANTS, StayLifecycleRepository } from './lifecycle.repository.js';
import { StayLifecycleService, stayLifecycleService } from './lifecycle.service.js';
import { StayLifecycleController } from './lifecycle.controller.js';
import type { IdempotencyService } from '../idempotency/service.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  checkoutStay: vi.fn(),
  extendStay: vi.fn(),
  readPostCheckoutActivity: vi.fn(),
  readStaySettlement: vi.fn(),
  recordResidentFundMovement: vi.fn(),
  transferStay: vi.fn(),
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./financial-read-scope.js', () => ({ lockFinancialReadStay: vi.fn() }));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => 'tx' }));
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({ userId: 'actor' }),
}));
const id = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
const actor = { userId: id(9) } as never;
const now = new Date('2026-10-25T10:00:00Z');
const settlement = {
  stayId: id(2),
  branchId: id(1),
  stayState: 'completed',
  invoices: [],
  invoicesTruncated: false,
  outstandingPaisa: 0,
  deposit: {
    receivedPaisa: 0,
    appliedToRentPaisa: 0,
    deductedPaisa: 0,
    refundedPaisa: 0,
    heldPaisa: 0,
  },
  advance: {
    receivedPaisa: 0,
    appliedToRentPaisa: 0,
    deductedPaisa: 0,
    refundedPaisa: 0,
    heldPaisa: 0,
  },
  netPayablePaisa: 0,
  netRefundablePaisa: 0,
  fundSources: [],
  asOf: '2026-10-25',
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockInventoryScope).mockResolvedValue({
    organizationId: id(5),
    actorRole: 'manager',
  } as never);
  vi.mocked(lockFinancialReadStay).mockResolvedValue({ id: id(2), branchId: id(1), userId: null });
});
it('CHG-010: each act locks exactly its explicit grants', async () => {
  const repository = new StayLifecycleRepository(queryFixture().database, () => now);
  await repository.authorize('tx' as never, actor, id(1), 'checkout');
  expect(vi.mocked(lockInventoryScope).mock.calls.map((call) => call[3])).toEqual([
    ...LIFECYCLE_GRANTS.checkout,
  ]);
  vi.mocked(lockInventoryScope).mockResolvedValue(undefined as never);
  await expect(repository.authorize('tx' as never, actor, id(1), 'transfer')).rejects.toMatchObject(
    {
      status: 403,
    },
  );
});
it('RES-005 / OUT-003..006: commands receive a labelled scope and a live authorizer', async () => {
  const store = queryFixture();
  store.enqueue(
    branches,
    [{ organizationId: id(5), ownerId: id(9) }],
    [{ organizationId: id(5), ownerId: id(8) }],
    [{ organizationId: id(5), ownerId: id(8) }],
  );
  const repository = new StayLifecycleRepository(store.database, () => now);
  vi.mocked(transferStay).mockImplementation(async (tx, _value, _clock, authorize) => {
    await authorize?.(tx, { branchId: id(1) } as never);
    return 't' as never;
  });
  await repository.transfer(store.transaction, actor, id(1), id(2), {} as never);
  expect(vi.mocked(transferStay).mock.calls[0]?.[1]).toMatchObject({
    scope: {
      organizationId: id(5),
      actorRole: 'owner',
      branchId: id(1),
      stayId: id(2),
      actorUserId: id(9),
    },
  });
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, id(1), 'stay_manage');
  await repository.extend(store.transaction, actor, id(1), id(2), {} as never);
  expect(vi.mocked(extendStay).mock.calls[0]?.[1]).toMatchObject({
    scope: { actorRole: 'manager' },
  });
  await repository.checkout(store.transaction, actor, id(1), id(2), {} as never);
  expect(checkoutStay).toHaveBeenCalled();
  await expect(
    repository.transfer(queryFixture().transaction, actor, id(1), id(2), {} as never),
  ).rejects.toMatchObject({ status: 403 });
  await repository.fundMovement(store.transaction, actor, id(1), id(2), id(3), {
    paymentId: id(4),
    movement: { kind: 'deposit_deduct', amountPaisa: 1, reason: 'r' },
  });
  expect(vi.mocked(recordResidentFundMovement).mock.calls[0]?.[1]).toMatchObject({
    scope: { actorRole: 'manager' },
    paymentId: id(4),
    commandId: id(3),
  });
  expect(lockInventoryScope).toHaveBeenCalledWith(
    store.transaction,
    actor,
    id(1),
    'checkout_manage',
  );
});
it('OUT-005: settlement and the frozen statement read under Stay authority', async () => {
  vi.mocked(readStaySettlement).mockResolvedValue(settlement as never);
  vi.mocked(readPostCheckoutActivity).mockResolvedValue({
    movements: [],
    current: settlement,
  } as never);
  const store = queryFixture();
  store.enqueue(stayFinalStatements, [{ id: id(6), createdAt: now, snapshot: settlement }], []);
  const repository = new StayLifecycleRepository(store.database, () => now);
  await expect(repository.settlement(actor, id(2), id(1))).resolves.toBe(settlement);
  expect(vi.mocked(readStaySettlement).mock.calls[0]?.[1]).toEqual({
    branchId: id(1),
    stayId: id(2),
    today: '2026-10-25',
  });
  await expect(repository.finalStatement(actor, id(2))).resolves.toMatchObject({
    statementId: id(6),
    afterCheckout: { movements: [] },
  });
  // P9-FIX-04: later records are read from the frozen statement's own creation time.
  expect(vi.mocked(readPostCheckoutActivity).mock.calls[0]?.[1]).toMatchObject({ since: now });
  await expect(repository.finalStatement(actor, id(2))).rejects.toMatchObject({ status: 404 });
  const broken = queryFixture();
  broken.enqueue(stayFinalStatements, [{ id: id(6), createdAt: now, snapshot: { bad: true } }]);
  await expect(
    new StayLifecycleRepository(broken.database, () => now).finalStatement(actor, id(2)),
  ).rejects.toMatchObject({ status: 500 });
});
it('RES-005 / OUT-006: the service binds identity locks, idempotency and response schemas', async () => {
  const store = queryFixture();
  store.enqueue(
    stays,
    [{ userId: id(7) }],
    [{ userId: null }],
    [{ userId: null }],
    [{ userId: null }],
  );
  const execute = vi.fn(async (_c, _s, _i, schema, authorize, run) => {
    await authorize('tx');
    return { status: 200, replayed: false, body: schema.parse(await run()) };
  });
  const repository = {
    authorize: vi.fn().mockResolvedValue({}),
    transfer: vi.fn().mockResolvedValue({
      stayId: id(2),
      fromAssignmentId: id(3),
      toAssignmentId: id(4),
      roomId: id(5),
      bedId: id(6),
      transferredAt: now.toISOString(),
      agreement: null,
    }),
    extend: vi.fn().mockResolvedValue({
      stayId: id(2),
      version: 3,
      expectedLeaveDate: '2027-01-01',
      billing: [],
    }),
    checkout: vi.fn().mockResolvedValue({ bad: true }),
    fundMovement: vi.fn().mockResolvedValue({
      movementId: id(3),
      paymentId: id(4),
      kind: 'deposit_apply',
      amountPaisa: 1,
    }),
    settlement: vi.fn().mockResolvedValue(settlement),
    finalStatement: vi.fn().mockResolvedValue({
      statementId: id(6),
      createdAt: now.toISOString(),
      statement: settlement,
      afterCheckout: { movements: [], current: settlement },
    }),
  };
  const service = new StayLifecycleService(
    store.database,
    repository as never,
    { withStore: () => ({ execute }) } as unknown as IdempotencyService,
  );
  const target = { kind: 'bed', roomId: id(5), bedId: id(6) };
  await expect(
    service.transfer(actor, id(8), id(1), id(2), { expectedVersion: 1, target, reason: 'r' }),
  ).resolves.toMatchObject({ body: { toAssignmentId: id(4) } });
  await expect(
    service.extend(actor, id(8), id(1), id(2), {
      expectedVersion: 1,
      expectedLeaveDate: '2027-01-01',
      reason: 'r',
    }),
  ).resolves.toMatchObject({ body: { version: 3 } });
  await expect(
    service.checkout(actor, id(8), id(1), id(2), {
      expectedVersion: 1,
      reason: 'r',
      applyAvailableDeposit: false,
    }),
  ).rejects.toMatchObject({ status: 500 });
  await expect(
    service.fundMovement(actor, id(8), id(1), id(2), {
      paymentId: id(4),
      movement: { kind: 'deposit_apply', amountPaisa: 1, reason: 'r', invoiceId: id(3) },
    }),
  ).resolves.toMatchObject({ status: 200 });
  await expect(service.settlement(actor, id(2), id(1))).resolves.toMatchObject({ stayId: id(2) });
  await expect(service.finalStatement(actor, id(2))).resolves.toMatchObject({ statementId: id(6) });
  await expect(
    service.transfer(actor, id(8), id(1), id(2), { expectedVersion: 1, target, reason: 'r' }),
  ).rejects.toMatchObject({ status: 404 });
  expect(stayLifecycleService(store.database, {} as never)).toBeInstanceOf(StayLifecycleService);
});
it('RES-005 / OUT-005: the controller unwraps idempotent results and delegates reads', async () => {
  const envelope = { status: 200, replayed: true, body: 'b' };
  const service = {
    transfer: vi.fn().mockResolvedValue(envelope),
    extend: vi.fn().mockResolvedValue(envelope),
    checkout: vi.fn().mockResolvedValue(envelope),
    fundMovement: vi.fn().mockResolvedValue(envelope),
    settlement: vi.fn().mockResolvedValue('s'),
    finalStatement: vi.fn().mockResolvedValue('f'),
  };
  const reply = { code: vi.fn(), header: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.header.mockReturnValue(reply);
  const request = { headers: { 'idempotency-key': id(8) } } as unknown as FastifyRequest;
  const controller = new StayLifecycleController(service as never);
  const r = reply as unknown as FastifyReply;
  await expect(controller.transfer(request, r, id(1), id(2), {})).resolves.toBe('b');
  await expect(controller.extend(request, r, id(1), id(2), {})).resolves.toBe('b');
  await expect(controller.checkout(request, r, id(1), id(2), {})).resolves.toBe('b');
  await expect(controller.fundMovement(request, r, id(1), id(2), {})).resolves.toBe('b');
  expect(reply.header).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
  await expect(controller.staffSettlement(request, id(1), id(2))).resolves.toBe('s');
  await expect(controller.ownSettlement(request, id(2))).resolves.toBe('s');
  await expect(controller.staffStatement(request, id(1), id(2))).resolves.toBe('f');
  await expect(controller.ownStatement(request, id(2))).resolves.toBe('f');
});
