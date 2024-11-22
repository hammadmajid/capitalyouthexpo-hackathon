import { beforeEach, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { reverseResidentPayment } from '@hsm/db';
import { lockPaymentAuthority, paymentCommandContext } from './payment.scope.js';
import { StayPaymentRepository } from './payment.repository.js';
import { StayPaymentService } from './payment.service.js';
import { StayPaymentController } from './payment.controller.js';
import { StayReceiptController } from './receipt.controller.js';
import type { IdempotencyService } from '../idempotency/service.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  reverseResidentPayment: vi.fn(),
}));
vi.mock('./payment.scope.js', () => ({
  lockPaymentAuthority: vi.fn(),
  paymentCommandContext: vi.fn(),
}));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => 'tx' }));
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({ userId: 'actor' }),
}));
const id = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
const actor = { userId: id(9) } as never;
const now = new Date('2026-10-25T10:00:00Z');
beforeEach(() => vi.resetAllMocks());
it('Q14 / PAY-008: only the Owner reverses, through the existing opposite-entry command', async () => {
  const repository = new StayPaymentRepository({} as never, 'b', undefined, () => now);
  vi.mocked(lockPaymentAuthority).mockResolvedValue({ actorRole: 'manager' } as never);
  await expect(
    repository.reverse('tx' as never, actor, id(1), id(2), id(3), { reason: 'Returned' }),
  ).rejects.toMatchObject({ status: 403 });
  expect(reverseResidentPayment).not.toHaveBeenCalled();
  vi.mocked(lockPaymentAuthority).mockResolvedValue({ actorRole: 'owner' } as never);
  vi.mocked(reverseResidentPayment).mockResolvedValue({ reversalId: id(4) } as never);
  await repository.reverse('tx' as never, actor, id(1), id(2), id(3), { reason: 'Returned' });
  expect(reverseResidentPayment).toHaveBeenCalledWith(
    'tx',
    {
      scope: { branchId: id(1), stayId: id(2), actorUserId: id(9), actorRole: 'owner' },
      paymentId: id(3),
      reversal: { reason: 'Returned' },
    },
    now,
  );
});
it('Q14: the service binds idempotency and the controller unwraps the replay envelope', async () => {
  vi.mocked(paymentCommandContext).mockResolvedValue({ store: {} as never, userId: null });
  const execute = vi.fn(async (_c, _s, _i, schema, authorize, run) => {
    await authorize('tx');
    return { status: 201, replayed: false, body: schema.parse(await run()) };
  });
  const repository = {
    context: vi.fn().mockResolvedValue({ store: {}, userId: null }),
    authorize: vi.fn().mockResolvedValue(true),
    reverse: vi.fn().mockResolvedValue({ reversalId: id(4), paymentId: id(3), receiptId: id(5) }),
  };
  const service = new StayPaymentService(
    repository as never,
    { withStore: () => ({ execute }) } as unknown as IdempotencyService,
  );
  await expect(
    service.reverse(actor, id(6), id(1), id(2), id(3), { reason: 'Returned' }),
  ).resolves.toMatchObject({ status: 201, body: { paymentId: id(3) } });
  await expect(service.reverse(actor, id(6), id(1), id(2), id(3), {})).rejects.toThrow();
  repository.reverse.mockResolvedValue({ bad: true });
  await expect(
    service.reverse(actor, id(6), id(1), id(2), id(3), { reason: 'Returned' }),
  ).rejects.toMatchObject({ status: 500 });
  const reply = { code: vi.fn(), header: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.header.mockReturnValue(reply);
  const controller = new StayPaymentController({
    reverse: vi.fn().mockResolvedValue({ status: 201, replayed: true, body: 'b' }),
  } as never);
  const request = { headers: { 'idempotency-key': id(6) } } as unknown as FastifyRequest;
  await expect(
    controller.reverse(request, reply as unknown as FastifyReply, id(1), id(2), id(3), {}),
  ).resolves.toBe('b');
  expect(reply.header).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
});
it('PAY-009: receipt PDF routes return private, uncached PDF bytes from the authorized read', async () => {
  const detail = {
    receiptId: id(5),
    receiptNumber: 'RCP/0001',
    issuedAt: now.toISOString(),
    reversed: false,
    snapshot: {
      version: 1,
      currency: 'PKR',
      paymentId: id(3),
      branchId: id(1),
      stayId: id(2),
      residentName: 'R',
      hostelName: 'H',
      branchName: 'B',
      amountPaisa: 100,
      method: 'cash',
      transactionReference: null,
      paidOn: '2026-10-24',
      approvedAt: now.toISOString(),
      allocations: [],
      distribution: { allocatedPaisa: 0, depositPaisa: 0, advanceCreditPaisa: 100 },
    },
  };
  const service = {
    staffDetail: vi.fn().mockResolvedValue(detail),
    customerDetail: vi.fn().mockResolvedValue(detail),
  };
  const reply = { header: vi.fn() };
  reply.header.mockReturnValue(reply);
  const controller = new StayReceiptController(service as never);
  const request = {} as FastifyRequest;
  const staff = await controller.staffPdf(request, reply as never, id(1), id(2), id(5), {});
  const own = await controller.customerPdf(request, reply as never, id(2), id(5), {});
  expect(staff.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(own.equals(staff)).toBe(true);
  expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
  expect(reply.header).toHaveBeenCalledWith(
    'Content-Disposition',
    'attachment; filename="receipt-RCP0001.pdf"',
  );
  expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
});
