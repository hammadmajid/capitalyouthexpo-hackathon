import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  checkoutStay,
  extendStay,
  readFinalStatement,
  readStaySettlement,
  recordStayFundMovement,
  transferStay,
} from './stay-lifecycle.js';
const ids = {
  branch: '10000000-0000-4000-8000-000000000001',
  stay: '10000000-0000-4000-8000-000000000002',
  room: '10000000-0000-4000-8000-000000000003',
  bed: '10000000-0000-4000-8000-000000000004',
  key: '10000000-0000-4000-8000-000000000005',
  other: '10000000-0000-4000-8000-000000000006',
};
const zero = {
  receivedPaisa: 0,
  appliedToRentPaisa: 0,
  deductedPaisa: 0,
  refundedPaisa: 0,
  heldPaisa: 0,
};
const settlement = {
  stayId: ids.stay,
  branchId: ids.branch,
  stayState: 'active',
  invoices: [],
  invoicesTruncated: false,
  outstandingPaisa: 0,
  deposit: zero,
  advance: zero,
  netPayablePaisa: 0,
  netRefundablePaisa: 0,
  fundSources: [],
  asOf: '2026-10-25',
};
function fixture(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'private-access' },
      fetch,
    }),
  };
}
const request = (value: ReturnType<typeof fixture>) => value.fetch.mock.calls[0]?.[0] as Request;
it('RES-005 / STAY: transfer and extension bind the Stay and idempotency key', async () => {
  const moved = {
    stayId: ids.stay,
    fromAssignmentId: ids.key,
    toAssignmentId: ids.other,
    roomId: ids.room,
    bedId: ids.bed,
    transferredAt: '2026-10-25T10:00:00.000Z',
    agreement: null,
  };
  const value = fixture(moved);
  const input = {
    expectedVersion: 1,
    target: { kind: 'bed', roomId: ids.room, bedId: ids.bed },
    reason: 'r',
  };
  await expect(transferStay(value.client, ids.branch, ids.stay, input, ids.key)).resolves.toEqual(
    moved,
  );
  expect(request(value).headers.get('Idempotency-Key')).toBe(ids.key);
  expect(await request(value).json()).toEqual(input);
  await expect(
    transferStay(
      fixture({ ...moved, stayId: ids.other }).client,
      ids.branch,
      ids.stay,
      input,
      ids.key,
    ),
  ).rejects.toThrow();
  await expect(
    extendStay(
      fixture({ stayId: ids.stay, version: 2, expectedLeaveDate: '2027-01-01', billing: [] })
        .client,
      ids.branch,
      ids.stay,
      { expectedVersion: 1, expectedLeaveDate: '2027-01-01', reason: 'r' },
      ids.key,
    ),
  ).resolves.toMatchObject({ version: 2 });
});
it('OUT-003..006: checkout, fund movements and statements validate their scope', async () => {
  const done = {
    stayId: ids.stay,
    state: 'completed',
    closedAt: '2026-10-25T10:00:00.000Z',
    statementId: ids.key,
    statement: { ...settlement, stayState: 'completed' },
    depositApplied: [],
  };
  const body = { expectedVersion: 2, reason: 'r', applyAvailableDeposit: false };
  await expect(
    checkoutStay(fixture(done).client, ids.branch, ids.stay, body, ids.key),
  ).resolves.toEqual(done);
  await expect(
    checkoutStay(
      fixture({ ...done, statement: { ...done.statement, stayId: ids.other } }).client,
      ids.branch,
      ids.stay,
      body,
      ids.key,
    ),
  ).rejects.toThrow();
  const movement = {
    paymentId: ids.other,
    movement: { kind: 'deposit_refund', amountPaisa: 5, reason: 'r' },
  };
  const result = {
    movementId: ids.key,
    paymentId: ids.other,
    kind: 'deposit_refund',
    amountPaisa: 5,
  };
  const fund = fixture(result);
  await expect(
    recordStayFundMovement(fund.client, ids.branch, ids.stay, movement, ids.key),
  ).resolves.toEqual(result);
  expect(await request(fund).json()).toEqual(movement);
  await expect(
    recordStayFundMovement(
      fixture({ ...result, amountPaisa: 6 }).client,
      ids.branch,
      ids.stay,
      movement,
      ids.key,
    ),
  ).rejects.toThrow();
  const own = fixture(settlement);
  await readStaySettlement(own.client, ids.stay);
  expect(request(own).url).toBe(`https://api.example.test/v1/me/stays/${ids.stay}/settlement`);
  const staff = fixture(settlement);
  await readStaySettlement(staff.client, ids.stay, ids.branch);
  expect(request(staff).url).toContain(`/v1/branches/${ids.branch}/stays/${ids.stay}/settlement`);
  await expect(readStaySettlement(fixture(settlement).client, ids.other)).rejects.toThrow();
  const statement = {
    statementId: ids.key,
    createdAt: done.closedAt,
    statement: done.statement,
    afterCheckout: { movements: [], current: done.statement },
  };
  await expect(readFinalStatement(fixture(statement).client, ids.stay)).resolves.toEqual(statement);
  await expect(
    readFinalStatement(fixture(statement).client, ids.stay, ids.branch),
  ).resolves.toEqual(statement);
  await expect(readFinalStatement(fixture(statement).client, ids.other)).rejects.toThrow();
});
