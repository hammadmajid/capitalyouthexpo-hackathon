import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { StayInvoiceRepository } from './invoice.repository.js';
import { StayInvoiceService } from './invoice.service.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  invoiceActor as actor,
  invoiceIds as ids,
  invoiceBalance,
} from '../../test/unit/stay-invoice.fixture.js';
const repository = new StayInvoiceRepository(queryFixture().database),
  service = new StayInvoiceService(repository);
const staff = vi.spyOn(repository, 'staffBalance'),
  customer = vi.spyOn(repository, 'customerBalance');
beforeEach(() => {
  vi.resetAllMocks();
  staff.mockResolvedValue(invoiceBalance);
  customer.mockResolvedValue(invoiceBalance);
});
function call(kind: 'staff' | 'customer', query: unknown = {}) {
  return kind === 'staff'
    ? service.staffBalance(actor, ids.branch, ids.stay, ids.invoice, query)
    : service.customerBalance(actor, ids.stay, ids.invoice, query);
}
it.each(['staff', 'customer'] as const)(
  'FIN-001: %s service validates identifiers and exact producer data',
  async (kind) => {
    expect(await call(kind)).toEqual(invoiceBalance);
    if (kind === 'staff')
      expect(staff).toHaveBeenCalledWith(actor, ids.branch, ids.stay, ids.invoice);
    else expect(customer).toHaveBeenCalledWith(actor, ids.stay, ids.invoice);
  },
);
it.each([
  { today: '2028-01-01' },
  { userId: actor.userId },
  { paid: true },
  { amountPaisa: 1 },
  { branchId: ids.branch },
])('SEC-003: client supplied financial overrides %# never reach repositories', async (query) => {
  await expect(call('staff', query)).rejects.toThrow();
  await expect(call('customer', query)).rejects.toThrow();
  expect(staff).not.toHaveBeenCalled();
  expect(customer).not.toHaveBeenCalled();
});
it.each(['staff', 'customer'] as const)(
  'PAY-008: corrupt %s paid projection never reaches the client',
  async (kind) => {
    const value = { ...invoiceBalance, state: 'paid' as const };
    staff.mockResolvedValue(value);
    customer.mockResolvedValue(value);
    await expect(call(kind)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Invoice data unavailable',
    });
  },
);
it.each(['staff', 'customer'] as const)(
  'SEC-003: sensitive extra %s producer fields fail closed',
  async (kind) => {
    const value = { ...invoiceBalance, cnic: 'private' };
    staff.mockResolvedValue(value);
    customer.mockResolvedValue(value);
    await expect(call(kind)).rejects.toMatchObject({ code: 'INTERNAL' });
  },
);
it('SEC-003: invalid object identifiers fail before any repository operation', async () => {
  await expect(service.staffBalance(actor, 'invalid', ids.stay, ids.invoice)).rejects.toThrow();
  await expect(service.staffBalance(actor, ids.branch, 'invalid', ids.invoice)).rejects.toThrow();
  await expect(service.customerBalance(actor, ids.stay, 'invalid')).rejects.toThrow();
  expect(staff).not.toHaveBeenCalled();
  expect(customer).not.toHaveBeenCalled();
});

it.each(['staff', 'customer'] as const)(
  'SEC-003: a valid %s projection for a different invoice is rejected',
  async (kind) => {
    const value = { ...invoiceBalance, invoiceId: randomUUID() };
    staff.mockResolvedValue(value);
    customer.mockResolvedValue(value);
    await expect(call(kind)).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
      message: 'Invoice data unavailable',
    });
  },
);
