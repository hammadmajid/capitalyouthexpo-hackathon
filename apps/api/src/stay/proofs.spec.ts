import { beforeEach, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  branches,
  files,
  readResidentInvoiceBalance,
  recordExternalResidentPayment,
  residentPaymentProofs,
  type Database,
} from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockFinancialReadStay } from './financial-read-scope.js';
import { lockPaymentAuthority, paymentCommandContext } from './payment.scope.js';
import { ResidentProofRepository } from './proofs.repository.js';
import { ResidentProofService, residentProofService } from './proofs.service.js';
import { ResidentProofController } from './proofs.controller.js';
import type { IdempotencyService } from '../idempotency/service.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalance: vi.fn(),
  recordExternalResidentPayment: vi.fn(),
}));
vi.mock('./financial-read-scope.js', () => ({ lockFinancialReadStay: vi.fn() }));
vi.mock('./payment.scope.js', () => ({
  lockPaymentAuthority: vi.fn(),
  paymentCommandContext: vi.fn(),
}));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('../idempotency/context.js', () => ({ requireTransaction: () => current }));
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({ userId: 'actor' }),
}));
let current: unknown;
const ids = {
  branch: '10000000-0000-4000-8000-000000000001',
  stay: '10000000-0000-4000-8000-000000000002',
  invoice: '10000000-0000-4000-8000-000000000003',
  file: '10000000-0000-4000-8000-000000000004',
  proof: '10000000-0000-4000-8000-000000000005',
  payment: '10000000-0000-4000-8000-000000000006',
  receipt: '10000000-0000-4000-8000-000000000007',
  user: '10000000-0000-4000-8000-000000000008',
};
const actor = { userId: ids.user } as never;
const now = new Date('2026-10-25T10:00:00Z');
const proofRow = (change: Record<string, unknown> = {}) => ({
  id: ids.proof,
  branchId: ids.branch,
  stayId: ids.stay,
  invoiceId: ids.invoice,
  submittedByUserId: ids.user,
  fileId: ids.file,
  amountPaisa: 1000n,
  method: 'bank_transfer',
  paidOn: '2026-10-24',
  reference: 'TRX-1',
  state: 'submitted',
  reviewedByUserId: null,
  reviewedAt: null,
  reviewReason: null,
  paymentId: null,
  createdAt: now,
  ...change,
});
const read = (change: Record<string, unknown> = {}) => ({
  proof: proofRow(change),
  invoiceNumber: 'INV-1',
  receiptId: change.paymentId ? ids.receipt : null,
  residentName: 'Resident',
  roomLabel: '101',
  bedLabel: 'A',
});
const cleanFile = {
  id: ids.file,
  uploadedBy: ids.user,
  bucket: 'private',
  visibility: 'private',
  purpose: 'payment_proof',
  scanStatus: 'clean',
  sha256: Buffer.alloc(32),
  objectKey: 'private/payment_proof/' + ids.file + '/x',
  mimeType: 'application/pdf',
};
const input = {
  invoiceId: ids.invoice,
  fileId: ids.file,
  amountPaisa: 1000,
  method: 'bank_transfer' as const,
  paidOn: '2026-10-24',
};
function balance(state: string, outstanding = 1500) {
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue({
    state,
    outstandingPaisa: outstanding,
  } as never);
}
function repository(store = queryFixture(), notices = { enqueue: vi.fn() }) {
  return {
    store,
    notices,
    audit: { sensitive: vi.fn() },
    repo: new ResidentProofRepository(store.database, 'private', notices as never, () => now, {
      sensitive: vi.fn(),
    } as never),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockFinancialReadStay).mockResolvedValue({
    id: ids.stay,
    branchId: ids.branch,
    userId: ids.user,
  });
  vi.mocked(lockPaymentAuthority).mockResolvedValue({
    organizationId: ids.branch,
    actorRole: 'owner',
    userId: ids.user,
  } as never);
});
it('PAY-002/003: submission records evidence, notifies the Owner and never posts payment', async () => {
  balance('issued');
  const { store, repo, notices } = repository();
  store.enqueue(files, [cleanFile]);
  store.enqueue(residentPaymentProofs, [], [], [{ id: ids.proof }], [read()]);
  store.enqueue(branches, [{ userId: ids.branch }]);
  const row = await repo.submit(store.transaction, actor, ids.stay, input);
  expect(repo.projectRow(row)).toMatchObject({ state: 'submitted', paymentId: null });
  expect(notices.enqueue).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({ event: 'resident.payment_proof_submitted', operationId: ids.proof }),
    now,
  );
  expect(recordExternalResidentPayment).not.toHaveBeenCalled();
});
it.each([
  ['a settled invoice', 'paid', [cleanFile], [], 409],
  ['a missing or foreign file', 'issued', [], [], 404],
  ['an already used file', 'issued', [cleanFile], [[{ id: ids.proof }]], 409],
  ['an open proof', 'issued', [cleanFile], [[], [{ id: ids.proof }]], 409],
] as const)(
  'PAY-003: submission refuses %s',
  async (_label, state, fileRows, proofRows, status) => {
    balance(state);
    const { store, repo } = repository();
    store.enqueue(files, [...fileRows]);
    store.enqueue(residentPaymentProofs, ...proofRows.map((rows) => [...rows]));
    await expect(repo.submit(store.transaction, actor, ids.stay, input)).rejects.toMatchObject({
      status,
    });
  },
);
it('PAY-007/008 / RENT-005: approval posts one payment with exact allocation and no excess credit', async () => {
  balance('issued', 1000);
  vi.mocked(recordExternalResidentPayment).mockImplementation(
    async (_tx, _value, _clock, validate) => {
      await validate?.(_tx, {} as never, ids.file);
      await expect(validate?.(_tx, {} as never, ids.stay)).rejects.toMatchObject({ status: 404 });
      return { paymentId: ids.payment } as never;
    },
  );
  const { store, repo, notices } = repository();
  store.enqueue(
    residentPaymentProofs,
    [{ stayId: ids.stay }],
    [proofRow()],
    [],
    [
      read({
        state: 'approved',
        paymentId: ids.payment,
        reviewedAt: now,
        reviewedByUserId: ids.user,
      }),
    ],
  );
  const row = await repo.review(store.transaction, actor, ids.branch, ids.proof, {
    decision: 'approve',
  });
  expect(repo.projectRow(row)).toMatchObject({ state: 'approved', receiptId: ids.receipt });
  expect(vi.mocked(recordExternalResidentPayment).mock.calls[0]?.[1]).toMatchObject({
    commandId: ids.proof,
    payment: {
      amountPaisa: 1000,
      proofFileId: ids.file,
      allocations: [{ invoiceId: ids.invoice, amountPaisa: 1000 }],
      advanceCreditPaisa: 0,
      transactionReference: 'TRX-1',
    },
  });
  expect(notices.enqueue).toHaveBeenCalledWith(
    store.transaction,
    expect.objectContaining({ event: 'resident.payment_recorded', operationId: ids.payment }),
    now,
  );
});
it('PAY-006: rejection keeps balances; reviewed, missing or settled proofs are refused', async () => {
  const { store, repo, notices } = repository();
  store.enqueue(
    residentPaymentProofs,
    [{ stayId: ids.stay }],
    [proofRow({ reference: null })],
    [],
    [read({ state: 'rejected', reviewReason: 'No', reviewedAt: now, reviewedByUserId: ids.user })],
  );
  vi.mocked(lockPaymentAuthority).mockResolvedValue({
    organizationId: ids.branch,
    actorRole: 'manager',
    userId: null,
  } as never);
  const row = await repo.review(store.transaction, actor, ids.branch, ids.proof, {
    decision: 'reject',
    reason: 'No',
  });
  expect(repo.projectRow(row)).toMatchObject({ state: 'rejected', reviewReason: 'No' });
  expect(notices.enqueue).not.toHaveBeenCalled();
  expect(recordExternalResidentPayment).not.toHaveBeenCalled();
  const missing = repository();
  await expect(
    missing.repo.review(missing.store.transaction, actor, ids.branch, ids.proof, {
      decision: 'approve',
    }),
  ).rejects.toMatchObject({ status: 404 });
  const reviewed = repository();
  reviewed.store.enqueue(
    residentPaymentProofs,
    [{ stayId: ids.stay }],
    [proofRow({ state: 'approved' })],
  );
  await expect(
    reviewed.repo.review(reviewed.store.transaction, actor, ids.branch, ids.proof, {
      decision: 'approve',
    }),
  ).rejects.toMatchObject({ status: 409 });
  balance('paid', 0);
  const settled = repository();
  settled.store.enqueue(residentPaymentProofs, [{ stayId: ids.stay }], [proofRow()]);
  await expect(
    settled.repo.review(settled.store.transaction, actor, ids.branch, ids.proof, {
      decision: 'approve',
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it('SEC-003: proof file reads are audited; unknown proofs and reads are unavailable', async () => {
  const { store, repo } = repository();
  store.enqueue(residentPaymentProofs, [{ proof: proofRow(), file: cleanFile }]);
  await expect(repo.proofFile(store.transaction, actor, ids.branch, ids.proof)).resolves.toBe(
    cleanFile,
  );
  const empty = repository();
  await expect(
    empty.repo.proofFile(empty.store.transaction, actor, ids.branch, ids.proof),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    empty.repo.read(empty.store.transaction, ids.branch, ids.proof),
  ).rejects.toMatchObject({ status: 404 });
  expect(() =>
    repo.projectRow({ ...read(), proof: proofRow({ state: 'approved' }) } as never),
  ).toThrow();
});
it('PAY-001..009: the service binds idempotency, pages and queue balances', async () => {
  balance('issued', 1500);
  const store = queryFixture();
  store.enqueue(residentPaymentProofs, [{ stayId: ids.stay }]);
  current = store.transaction;
  const execute = vi.fn(async (_c, _s, _i, schema, authorize, run) => {
    await authorize(store.transaction);
    return { status: 200, replayed: false, body: schema.parse(await run()) };
  });
  const idempotency = { execute, withStore: () => ({ execute }) } as unknown as IdempotencyService;
  vi.mocked(paymentCommandContext).mockResolvedValue({ store: {} as never, userId: ids.user });
  const repo = {
    submit: vi.fn().mockResolvedValue(read()),
    review: vi
      .fn()
      .mockResolvedValue(
        read({ state: 'rejected', reviewReason: 'x', reviewedAt: now, reviewedByUserId: ids.user }),
      ),
    projectRow: (row: ReturnType<typeof read>) =>
      new ResidentProofRepository(store.database, 'b').projectRow(row as never),
    ownPage: vi.fn().mockResolvedValue([read(), read()]),
    queue: vi.fn().mockResolvedValue([read()]),
    invoiceBalance: vi.fn().mockResolvedValue({ outstandingPaisa: 1500 }),
    billsOf: vi.fn(async (_tx: unknown, proof: { invoiceId: string }) => [proof.invoiceId]),
    proofFile: vi.fn().mockResolvedValue(cleanFile),
  };
  const storage = { presignDownload: vi.fn().mockResolvedValue('https://files.example.test/x') };
  const service = new ResidentProofService(
    store.database,
    repo as never,
    idempotency,
    storage as never,
    () => now,
  );
  await expect(service.submit(actor, ids.proof, ids.stay, input)).resolves.toMatchObject({
    status: 200,
  });
  await expect(
    service.review(actor, ids.proof, ids.branch, ids.proof, { decision: 'reject', reason: 'x' }),
  ).resolves.toMatchObject({ body: { state: 'rejected' } });
  const page = await service.ownPage(actor, ids.stay, { limit: 1 });
  expect(page.nextCursor).toBe(ids.proof);
  const queue = await service.queue(actor, ids.branch, {});
  expect(queue.data[0]).toMatchObject({ amountMismatch: true, invoiceOutstandingPaisa: 1500 });
  await expect(service.download(actor, ids.branch, ids.proof)).resolves.toMatchObject({
    url: 'https://files.example.test/x',
  });
  storage.presignDownload.mockRejectedValue(new Error('down'));
  await expect(service.download(actor, ids.branch, ids.proof)).rejects.toMatchObject({
    status: 503,
  });
  await expect(service.review(actor, ids.proof, ids.branch, ids.stay, {})).rejects.toThrow();
  const missing = new ResidentProofService(
    queryFixture().database,
    repo as never,
    idempotency,
    storage as never,
  );
  await expect(
    missing.review(actor, ids.proof, ids.branch, ids.proof, { decision: 'approve' }),
  ).rejects.toMatchObject({ status: 404 });
  expect(residentProofService({} as Database, idempotency, storage as never, 'b')).toBeInstanceOf(
    ResidentProofService,
  );
});
it('PAY-002..006: the controller unwraps idempotent results and delegates reads', async () => {
  const body = { id: 'x' };
  const service = {
    instructions: vi.fn().mockResolvedValue('i'),
    submit: vi.fn().mockResolvedValue({ status: 201, replayed: true, body }),
    ownPage: vi.fn().mockResolvedValue('o'),
    queue: vi.fn().mockResolvedValue('q'),
    review: vi.fn().mockResolvedValue({ status: 200, replayed: false, body }),
    download: vi.fn().mockResolvedValue('d'),
  };
  const reply = { code: vi.fn(), header: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.header.mockReturnValue(reply);
  const request = { headers: { 'idempotency-key': 'k' } } as unknown as FastifyRequest;
  const controller = new ResidentProofController(service as never);
  await expect(controller.instructions(request, 's')).resolves.toBe('i');
  await expect(controller.submit(request, reply as unknown as FastifyReply, 's', {})).resolves.toBe(
    body,
  );
  expect(reply.code).toHaveBeenCalledWith(201);
  expect(reply.header).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
  await expect(controller.own(request, 's', {})).resolves.toBe('o');
  await expect(controller.queue(request, 'b', {})).resolves.toBe('q');
  await expect(
    controller.review(request, reply as unknown as FastifyReply, 'b', 'p', {}),
  ).resolves.toBe(body);
  await expect(controller.download(request, 'b', 'p')).resolves.toBe('d');
});
