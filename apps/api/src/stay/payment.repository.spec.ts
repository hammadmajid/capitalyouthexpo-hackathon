import { beforeEach, expect, it, vi } from 'vitest';
import { recordExternalResidentPayment } from '@hsm/db';
import { NotificationProducer } from '@hsm/notifications';
import { lockPaymentAuthority, paymentCommandContext } from './payment.scope.js';
import { authorizeRecordedPaymentProof } from './payment-proof.js';
import { StayPaymentRepository } from './payment.repository.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  paymentActor as actor,
  paymentIds as ids,
  paymentNow as now,
  paymentInput as input,
  paymentResult as result,
  paymentAuthority,
} from '../../test/unit/stay-payment.fixture.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  recordExternalResidentPayment: vi.fn(),
}));
vi.mock('./payment.scope.js', () => ({
  lockPaymentAuthority: vi.fn(),
  paymentCommandContext: vi.fn(),
}));
vi.mock('./proof-security.js', () => ({ requireProofSecurity: vi.fn() }));
vi.mock('./payment-proof.js', () => ({ authorizeRecordedPaymentProof: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockPaymentAuthority).mockResolvedValue({ ...paymentAuthority, userId: ids.customer });
  vi.mocked(recordExternalResidentPayment).mockResolvedValue(result);
});
function fixture() {
  const f = queryFixture(),
    notices = new NotificationProducer(),
    enqueue = vi.spyOn(notices, 'enqueue').mockResolvedValue();
  return {
    ...f,
    enqueue,
    repo: new StayPaymentRepository(f.database, 'private-test', notices, () => now),
  };
}
it('PAY-008 / NTF-002: receipt and linked resident notice share exact authorized transaction and real actor', async () => {
  const f = fixture();
  expect(await f.repo.authorize(f.transaction, actor, ids.branch, ids.stay, ids.customer)).toBe(
    true,
  );
  expect(
    await f.repo.record(
      f.transaction,
      actor,
      ids.branch,
      ids.stay,
      ids.customer,
      ids.command,
      input,
    ),
  ).toEqual(result);
  expect(recordExternalResidentPayment).toHaveBeenCalledWith(
    f.transaction,
    {
      scope: {
        branchId: ids.branch,
        stayId: ids.stay,
        actorUserId: actor.userId,
        actorRole: 'owner',
      },
      commandId: ids.command,
      payment: input,
    },
    now,
    expect.any(Function),
  );
  expect(f.enqueue).toHaveBeenCalledWith(
    f.transaction,
    { userId: ids.customer, event: 'resident.payment_recorded', operationId: result.paymentId },
    now,
  );
  const call = vi.mocked(recordExternalResidentPayment).mock.calls[0];
  if (!call?.[3]) throw Error('Proof authorizer missing');
  await call[3](
    f.transaction,
    { branchId: ids.branch, stayId: ids.stay, actorUserId: actor.userId, actorRole: 'owner' },
    ids.file,
  );
  expect(authorizeRecordedPaymentProof).toHaveBeenCalledWith(
    f.transaction,
    actor,
    ids.file,
    'private-test',
    now,
  );
});
it('RES-003 / PAY-008: offline resident creates no fake notification recipient or login identity', async () => {
  const f = fixture();
  vi.mocked(lockPaymentAuthority).mockResolvedValue({ ...paymentAuthority, userId: null });
  expect(
    await f.repo.record(f.transaction, actor, ids.branch, ids.stay, null, ids.command, input),
  ).toEqual(result);
  expect(f.enqueue).not.toHaveBeenCalled();
});
it('SEC-003: changed explicit account link blocks fresh mutation and replay authorization', async () => {
  const f = fixture();
  vi.mocked(lockPaymentAuthority).mockResolvedValue({ ...paymentAuthority, userId: null });
  await expect(
    f.repo.authorize(f.transaction, actor, ids.branch, ids.stay, ids.customer),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  await expect(
    f.repo.record(f.transaction, actor, ids.branch, ids.stay, ids.customer, ids.command, input),
  ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  expect(recordExternalResidentPayment).not.toHaveBeenCalled();
  expect(f.enqueue).not.toHaveBeenCalled();
});
it('AUD-004 / NTF-002: required outbox failure propagates to roll back financial command', async () => {
  const f = fixture();
  f.enqueue.mockRejectedValue(new Error('Required notice failed'));
  await expect(
    f.repo.record(f.transaction, actor, ids.branch, ids.stay, ids.customer, ids.command, input),
  ).rejects.toThrow('Required notice failed');
});
it('PAY-008: rejected financial command never enqueues a success notice', async () => {
  const f = fixture();
  vi.mocked(recordExternalResidentPayment).mockRejectedValue(new Error('Required receipt failed'));
  await expect(
    f.repo.record(f.transaction, actor, ids.branch, ids.stay, ids.customer, ids.command, input),
  ).rejects.toThrow('Required receipt failed');
  expect(f.enqueue).not.toHaveBeenCalled();
});
it('SEC-003: command context delegates exact preflight scope and clock', async () => {
  const f = fixture();
  await f.repo.context(actor, ids.branch, ids.stay);
  expect(paymentCommandContext).toHaveBeenCalledWith(
    f.database,
    actor,
    ids.branch,
    ids.stay,
    expect.any(Function),
  );
});
