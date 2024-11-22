import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PgDialect } from 'drizzle-orm/pg-core';
import { stays, readResidentInvoiceBalance } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  invoiceActor as actor,
  invoiceIds as ids,
  invoiceStay,
  invoiceNow as now,
  invoiceBalance,
} from '../../test/unit/stay-invoice.fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { withInvoiceComponents } from './invoice-components.js';
import { StayInvoiceRepository } from './invoice.repository.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalance: vi.fn(),
}));
vi.mock('./invoice-components.js', () => ({ withInvoiceComponents: vi.fn() }));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue(invoiceBalance);
  vi.mocked(withInvoiceComponents).mockResolvedValue(invoiceBalance);
});
function call(repository: StayInvoiceRepository, kind: 'staff' | 'customer') {
  return kind === 'staff'
    ? repository.staffBalance(actor, ids.branch, ids.stay, ids.invoice)
    : repository.customerBalance(actor, ids.stay, ids.invoice);
}
it.each(['staff', 'customer'] as const)(
  'FIN-001 / SEC-003: %s reads bind exact Stay and server-derived financial date in one transaction',
  async (kind) => {
    const f = queryFixture();
    f.enqueue(stays, [invoiceStay]);
    const repo = new StayInvoiceRepository(f.database, () => now);
    expect(await call(repo, kind)).toEqual(invoiceBalance);
    expect(readResidentInvoiceBalance).toHaveBeenCalledWith(f.transaction, {
      branchId: ids.branch,
      stayId: ids.stay,
      invoiceId: ids.invoice,
      today: '2028-02-01',
    });
    expect(f.locks).toContainEqual({ table: stays, mode: 'share' });
    const predicate = f.predicates[0];
    if (!predicate) throw new Error('Stay scope missing');
    expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([
      ids.stay,
      kind === 'staff' ? ids.branch : actor.userId,
    ]);
    if (kind === 'staff') {
      expect(lockInventoryScope).toHaveBeenCalledWith(
        f.transaction,
        actor,
        ids.branch,
        'finance_view',
      );
      expect(lockActor).toHaveBeenCalledTimes(2);
    } else {
      expect(lockInventoryScope).not.toHaveBeenCalled();
      expect(lockActor).toHaveBeenCalledTimes(1);
    }
    expect(f.writes).toEqual([]);
  },
);
it.each(['staff', 'customer'] as const)(
  'SEC-003: missing exact %s Stay prevents all financial access',
  async (kind) => {
    const repo = new StayInvoiceRepository(queryFixture().database);
    await expect(call(repo, kind)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
  },
);
it.each([
  { kind: 'staff' as const, patch: { id: randomUUID() } },
  { kind: 'staff' as const, patch: { branchId: randomUUID() } },
  { kind: 'customer' as const, patch: { id: randomUUID() } },
  { kind: 'customer' as const, patch: { userId: randomUUID() } },
  { kind: 'customer' as const, patch: { userId: null } },
])(
  'SEC-003: corrupt or unlinked producer scope %# fails closed before money queries',
  async ({ kind, patch }) => {
    const f = queryFixture();
    f.enqueue(stays, [{ ...invoiceStay, ...patch }]);
    const repo = new StayInvoiceRepository(f.database);
    await expect(call(repo, kind)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
  },
);
it('SEC-003: account/session revocation prevents branch and financial reads', async () => {
  vi.mocked(lockActor).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Account unavailable'));
  const f = queryFixture();
  await expect(call(new StayInvoiceRepository(f.database), 'staff')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(lockInventoryScope).not.toHaveBeenCalled();
  expect(f.predicates).toEqual([]);
  expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
});
it('ACC-002: denied finance_view stops before Stay or invoice access', async () => {
  vi.mocked(lockInventoryScope).mockRejectedValue(
    new DomainError('FORBIDDEN', 403, 'Management permission required'),
  );
  const f = queryFixture();
  await expect(call(new StayInvoiceRepository(f.database), 'staff')).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(f.predicates).toEqual([]);
  expect(readResidentInvoiceBalance).not.toHaveBeenCalled();
});
it('FIN-001: Karachi midnight determines overdue date even while UTC is still the previous day', async () => {
  const f = queryFixture();
  f.enqueue(stays, [invoiceStay]);
  await call(
    new StayInvoiceRepository(f.database, () => new Date('2028-02-01T20:00:00Z')),
    'customer',
  );
  expect(readResidentInvoiceBalance).toHaveBeenCalledWith(
    f.transaction,
    expect.objectContaining({ today: '2028-02-02' }),
  );
});
it('FIN-001: default clock derives a valid server calendar day', async () => {
  const f = queryFixture();
  f.enqueue(stays, [invoiceStay]);
  await call(new StayInvoiceRepository(f.database), 'customer');
  expect(readResidentInvoiceBalance).toHaveBeenCalledWith(
    f.transaction,
    expect.objectContaining({ today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
  );
});
it('SEC-003: scoped financial reader failures propagate without fallback balances', async () => {
  const f = queryFixture();
  f.enqueue(stays, [invoiceStay]);
  vi.mocked(readResidentInvoiceBalance).mockRejectedValue(
    new DomainError('NOT_FOUND', 404, 'Invoice unavailable'),
  );
  await expect(call(new StayInvoiceRepository(f.database), 'customer')).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
});
