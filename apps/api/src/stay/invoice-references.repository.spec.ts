import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stays, residentInvoices } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  invoiceActor as actor,
  invoiceIds as ids,
  invoiceStay,
  invoiceNow as now,
} from '../../test/unit/stay-invoice.fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { StayInvoiceRepository } from './invoice.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const third = '10000000-0000-4000-8000-000000000003';
const row = {
  invoiceId: second,
  invoiceNumber: 'INV-2',
  dueDate: '2028-03-01',
  issuedAt: now,
  documentState: 'issued',
};
beforeEach(() => vi.resetAllMocks());
function fixture(
  rows: unknown[] = [row],
  kind: 'staff' | 'own' = 'staff',
  query = { limit: 1, cursor: first },
) {
  const f = queryFixture();
  f.enqueue(stays, [invoiceStay]);
  f.enqueue(residentInvoices, rows);
  const repository = new StayInvoiceRepository(f.database, () => now);
  return {
    ...f,
    call: () =>
      kind === 'staff'
        ? repository.staffList(actor, ids.branch, ids.stay, query)
        : repository.customerList(actor, ids.stay, query),
  };
}
it.each(['staff', 'own'] as const)(
  'FIN-001 / SEC-003: %s references reuse live authorization and bound limit+1 without financial inference',
  async (kind) => {
    const f = fixture([row, { ...row, invoiceId: third, documentState: 'voided' }], kind);
    expect(await f.call()).toEqual({
      branchId: ids.branch,
      stayId: ids.stay,
      data: [{ ...row, issuedAt: now.toISOString() }],
      nextCursor: second,
    });
    const predicate = f.predicates.find((entry) => entry.table === residentInvoices);
    if (!predicate) throw Error('Missing invoice scope');
    const parameters = new PgDialect().sqlToQuery(predicate.value).params;
    expect(parameters.filter((value) => typeof value === 'string')).toEqual([
      ids.branch,
      ids.stay,
      first,
    ]);
    expect(parameters).toHaveLength(3);
    expect(f.operations).toContainEqual({ table: residentInvoices, kind: 'limit', args: [2] });
    expect(f.operations.some((op) => op.table === residentInvoices && op.kind === 'orderBy')).toBe(
      true,
    );
    expect(f.locks).toContainEqual({ table: stays, mode: 'share' });
    expect(f.writes).toEqual([]);
    if (kind === 'staff')
      expect(lockInventoryScope).toHaveBeenCalledWith(
        f.transaction,
        actor,
        ids.branch,
        'finance_view',
      );
    else expect(lockInventoryScope).not.toHaveBeenCalled();
    expect(lockActor).toHaveBeenCalled();
  },
);
it('FIN-001: true empty page, retained voided references and no-cursor initial page remain distinct', async () => {
  expect(await fixture([]).call()).toMatchObject({ data: [], nextCursor: null });
  expect(await fixture([{ ...row, documentState: 'voided' }]).call()).toMatchObject({
    data: [{ documentState: 'voided' }],
    nextCursor: null,
  });
  const f = queryFixture();
  f.enqueue(stays, [invoiceStay]);
  f.enqueue(residentInvoices, [row]);
  expect(
    await new StayInvoiceRepository(f.database, () => now).customerList(actor, ids.stay, {
      limit: 20,
    }),
  ).toMatchObject({ nextCursor: null });
});
it.each(
  [
    [{ ...row, issuedAt: new Date('invalid') }],
    [{ ...row, invoiceNumber: '' }],
    [{ ...row, documentState: 'paid' }],
    [{ ...row, dueDate: '0000-01-01' }],
    [row, row],
    [{ ...row, invoiceId: first }],
    [{ ...row, invoiceId: third }, row],
    [row, { ...row, invoiceId: third }, { ...row, invoiceId: third }],
  ].map((rows) => ({ rows })),
)('FIN-001 / SEC-003: malformed or inconsistent stored page fails closed %#', async ({ rows }) => {
  await expect(fixture(rows).call()).rejects.toMatchObject({ code: 'INTERNAL' });
});
it('SEC-003: denied current financial grant never reads invoice records', async () => {
  const f = fixture();
  vi.mocked(lockInventoryScope).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Denied'));
  await expect(f.call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.predicates.some((entry) => entry.table === residentInvoices)).toBe(false);
});
it('SEC-003: unknown exact own Stay never reads invoice records', async () => {
  const f = queryFixture();
  f.enqueue(stays, []);
  await expect(
    new StayInvoiceRepository(f.database, () => now).customerList(actor, ids.stay, { limit: 20 }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.predicates.some((entry) => entry.table === residentInvoices)).toBe(false);
});
