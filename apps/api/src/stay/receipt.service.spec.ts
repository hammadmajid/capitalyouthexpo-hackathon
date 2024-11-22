import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { StayReceiptRepository } from './receipt.repository.js';
import { StayReceiptService } from './receipt.service.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  receiptActor as actor,
  receiptIds as ids,
  receiptDetail,
} from '../../test/unit/stay-receipt.fixture.js';
const repository = new StayReceiptRepository(queryFixture().database),
  service = new StayReceiptService(repository);
const staff = vi.spyOn(repository, 'staffDetail'),
  customer = vi.spyOn(repository, 'customerDetail');
beforeEach(() => {
  vi.resetAllMocks();
  staff.mockResolvedValue(receiptDetail);
  customer.mockResolvedValue(receiptDetail);
});
function call(kind: 'staff' | 'customer', query: unknown = {}) {
  return kind === 'staff'
    ? service.staffDetail(actor, ids.branch, ids.stay, ids.receipt, query)
    : service.customerDetail(actor, ids.stay, ids.receipt, query);
}
it.each(['staff', 'customer'] as const)(
  'PAY-008: %s receipt service binds exact scope and original snapshot',
  async (kind) => {
    expect(await call(kind)).toEqual(receiptDetail);
    if (kind === 'staff')
      expect(staff).toHaveBeenCalledWith(actor, ids.branch, ids.stay, ids.receipt);
    else expect(customer).toHaveBeenCalledWith(actor, ids.stay, ids.receipt);
  },
);
it.each([{ includeProof: true }, { userId: actor.userId }, { reversed: false }])(
  'SEC-003: query override %# fails before receipt repositories',
  async (query) => {
    await expect(call('staff', query)).rejects.toThrow();
    await expect(call('customer', query)).rejects.toThrow();
    expect(staff).not.toHaveBeenCalled();
    expect(customer).not.toHaveBeenCalled();
  },
);
it.each([
  { patch: { receiptId: randomUUID() } },
  { patch: { snapshot: { ...receiptDetail.snapshot, stayId: randomUUID() } } },
  { patch: { snapshot: { ...receiptDetail.snapshot, cnic: 'Private' } } },
  { patch: { proofFileId: randomUUID() } },
  { patch: { receiptNumber: '' } },
])(
  'SEC-003 / PAY-008: mismatched/private/corrupt receipt producer %# is opaque500',
  async ({ patch }) => {
    staff.mockResolvedValue({ ...receiptDetail, ...patch });
    customer.mockResolvedValue({ ...receiptDetail, ...patch });
    for (const kind of ['staff', 'customer'] as const)
      await expect(call(kind)).rejects.toMatchObject({
        code: 'INTERNAL',
        status: 500,
        message: 'Receipt data unavailable',
      });
  },
);
it('SEC-003: staff receipt response cannot substitute another branch', async () => {
  staff.mockResolvedValue({
    ...receiptDetail,
    snapshot: { ...receiptDetail.snapshot, branchId: randomUUID() },
  });
  await expect(call('staff')).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
});
it('SEC-003: invalid receipt identifiers fail before repository access', async () => {
  await expect(service.staffDetail(actor, 'bad', ids.stay, ids.receipt)).rejects.toThrow();
  await expect(service.staffDetail(actor, ids.branch, 'bad', ids.receipt)).rejects.toThrow();
  await expect(service.staffDetail(actor, ids.branch, ids.stay, 'bad')).rejects.toThrow();
  await expect(service.customerDetail(actor, 'bad', ids.receipt)).rejects.toThrow();
  await expect(service.customerDetail(actor, ids.stay, 'bad')).rejects.toThrow();
  expect(staff).not.toHaveBeenCalled();
  expect(customer).not.toHaveBeenCalled();
});
it('PAY-008: a reversed receipt remains historical evidence without a new payment', async () => {
  customer.mockResolvedValue({ ...receiptDetail, reversed: true });
  expect(await call('customer')).toEqual({ ...receiptDetail, reversed: true });
});
