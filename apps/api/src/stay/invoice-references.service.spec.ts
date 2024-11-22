import { beforeEach, expect, it, vi } from 'vitest';
import type { StayInvoiceReferencePage } from '@hsm/contracts';
import { StayInvoiceRepository } from './invoice.repository.js';
import { StayInvoiceService } from './invoice.service.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { invoiceActor as actor, invoiceIds as ids } from '../../test/unit/stay-invoice.fixture.js';
const invoiceId = '10000000-0000-4000-8000-000000000001';
const page: StayInvoiceReferencePage = {
  branchId: ids.branch,
  stayId: ids.stay,
  nextCursor: null,
  data: [
    {
      invoiceId,
      invoiceNumber: 'INV-1',
      issuedAt: '2028-02-01T06:00:00.000Z',
      dueDate: '2028-03-01',
      documentState: 'issued',
    },
  ],
};
const repository = new StayInvoiceRepository(queryFixture().database),
  service = new StayInvoiceService(repository);
const staff = vi.spyOn(repository, 'staffList'),
  own = vi.spyOn(repository, 'customerList');
beforeEach(() => {
  vi.resetAllMocks();
  staff.mockResolvedValue(page);
  own.mockResolvedValue(page);
});
function call(kind: 'staff' | 'own', query: unknown = {}) {
  return kind === 'staff'
    ? service.staffList(actor, ids.branch, ids.stay, query)
    : service.customerList(actor, ids.stay, query);
}
it.each(['staff', 'own'] as const)(
  'FIN-001: %s list uses exact validated scope and default limit20',
  async (kind) => {
    expect(await call(kind)).toEqual(page);
    if (kind === 'staff')
      expect(staff).toHaveBeenCalledWith(actor, ids.branch, ids.stay, { limit: 20 });
    else expect(own).toHaveBeenCalledWith(actor, ids.stay, { limit: 20 });
  },
);
it.each([
  { limit: 0 },
  { limit: 101 },
  { cursor: 'bad' },
  { userId: actor.userId },
  { paid: true },
  { includePrivate: true },
])(
  'SEC-003: invalid or identity-expanded query cannot reach either repository %#',
  async (query) => {
    await expect(call('staff', query)).rejects.toThrow();
    await expect(call('own', query)).rejects.toThrow();
    expect(staff).not.toHaveBeenCalled();
    expect(own).not.toHaveBeenCalled();
  },
);
it.each(['staff', 'own'] as const)(
  'SEC-003: wrong-target or expanded %s producer data becomes sanitized INTERNAL',
  async (kind) => {
    for (const corrupt of [
      { ...page, stayId: invoiceId },
      { ...page, residentName: 'sensitive value' },
      { ...page, nextCursor: invoiceId },
      { ...page, data: [...page.data, ...page.data] },
    ]) {
      staff.mockResolvedValue(corrupt);
      own.mockResolvedValue(corrupt);
      await expect(call(kind)).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
    }
  },
);
it('SEC-003: staff branch response, exclusive cursor and requested count are validated independently', async () => {
  staff.mockResolvedValue({ ...page, branchId: invoiceId });
  await expect(call('staff')).rejects.toMatchObject({ code: 'INTERNAL' });
  staff.mockResolvedValue(page);
  own.mockResolvedValue(page);
  await expect(call('staff', { cursor: invoiceId })).rejects.toMatchObject({ code: 'INTERNAL' });
  await expect(call('own', { cursor: invoiceId })).rejects.toMatchObject({ code: 'INTERNAL' });
});
it('SEC-003: bad path UUIDs never reach repositories', async () => {
  await expect(service.staffList(actor, 'bad', ids.stay)).rejects.toThrow();
  await expect(service.staffList(actor, ids.branch, 'bad')).rejects.toThrow();
  await expect(service.customerList(actor, 'bad')).rejects.toThrow();
  expect(staff).not.toHaveBeenCalled();
  expect(own).not.toHaveBeenCalled();
});
