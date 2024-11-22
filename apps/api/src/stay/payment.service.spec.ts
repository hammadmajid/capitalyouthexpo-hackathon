import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DomainError, recordedResidentPaymentSchema } from '@hsm/contracts';
import { IdempotencyService } from '../idempotency/service.js';
import { paymentServiceFixture as fixture } from '../../test/unit/stay-payment-service.fixture.js';
import {
  paymentActor as actor,
  paymentIds as ids,
  paymentInput as input,
  paymentResult as result,
  paymentNow as now,
} from '../../test/unit/stay-payment.fixture.js';
function call(
  f: ReturnType<typeof fixture>,
  body: unknown = input,
  key: unknown = ids.command,
  branch: unknown = ids.branch,
  stay: unknown = ids.stay,
) {
  return f.service.record(actor, key, branch, stay, body);
}
it('PAY-008 / ACC-004: normalized same-intent payment replays only after current authority without another receipt', async () => {
  const f = fixture();
  expect(
    await call(
      f,
      { ...input, note: ' Hostel received cash ' },
      ids.command.toUpperCase(),
      ids.branch.toUpperCase(),
    ),
  ).toEqual({ status: 201, body: result, replayed: false });
  expect((await call(f)).replayed).toBe(true);
  expect(f.record).toHaveBeenCalledTimes(1);
  expect(f.authorize).toHaveBeenCalledTimes(2);
  expect(f.record).toHaveBeenCalledWith(
    f.query.transaction,
    actor,
    ids.branch,
    ids.stay,
    ids.customer,
    ids.command,
    input,
  );
  f.authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Grant revoked'));
  await expect(call(f)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.record).toHaveBeenCalledTimes(1);
});
it('ACC-004: same key cannot alias amount, Stay or branch', async () => {
  const f = fixture();
  await call(f);
  await expect(call(f, { ...input, amountPaisa: 1002, depositPaisa: 1002 })).rejects.toMatchObject({
    code: 'IDEMPOTENCY_KEY_REUSED',
  });
  await expect(call(f, input, ids.command, randomUUID())).rejects.toMatchObject({
    code: 'IDEMPOTENCY_KEY_REUSED',
  });
  await expect(call(f, input, ids.command, ids.branch, randomUUID())).rejects.toMatchObject({
    code: 'IDEMPOTENCY_KEY_REUSED',
  });
  expect(f.record).toHaveBeenCalledTimes(1);
});
it.each([{ amountPaisa: 999 }, { receiptId: 'bad' }, { bankVerified: true }])(
  'SEC-003: mismatched or malformed producer result %# cannot be cached as success',
  async (patch) => {
    const f = fixture();
    f.record.mockResolvedValue({ ...result, ...patch });
    await expect(call(f)).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
    expect(f.responses.size).toBe(0);
  },
);
it('SEC-003: malformed stored replay is not a successful receipt', async () => {
  const f = fixture();
  await call(f);
  const row = f.responses.get(ids.command);
  if (!row) throw Error('Response missing');
  f.responses.set(ids.command, { ...row, responseBody: { ...result, amountPaisa: 999 } });
  await expect(call(f)).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
  expect(f.record).toHaveBeenCalledTimes(1);
});
it('SEC-003: invalid command inputs fail before participant preflight', async () => {
  const f = fixture();
  await expect(call(f, input, 'bad')).rejects.toThrow();
  await expect(call(f, input, ids.command, 'bad')).rejects.toThrow();
  await expect(call(f, input, ids.command, ids.branch, 'bad')).rejects.toThrow();
  await expect(call(f, { ...input, amountPaisa: 0.1 })).rejects.toThrow();
  expect(f.context).not.toHaveBeenCalled();
});
it('PAY-008 / NTF-002: required transaction failure is never cached and retry uses same intent', async () => {
  const f = fixture();
  f.record.mockRejectedValueOnce(new Error('Required outbox failed'));
  await expect(call(f)).rejects.toThrow('Required outbox failed');
  expect(f.responses.size).toBe(0);
  expect((await call(f)).body).toEqual(result);
});
it('SEC-003: preflight denial prevents idempotency/financial work', async () => {
  const f = fixture();
  f.context.mockRejectedValue(new DomainError('NOT_FOUND', 404, 'Stay unavailable'));
  await expect(call(f)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.authorize).not.toHaveBeenCalled();
  expect(f.record).not.toHaveBeenCalled();
});

it('PAY-008 / CHG-055: new overpayment is refused before financial work', async () => {
  const f = fixture();
  await expect(call(f, { ...input, amountPaisa: 1002, advanceCreditPaisa: 1 })).rejects.toThrow(
    'Payment exceeds',
  );
  expect(f.record).not.toHaveBeenCalled();
});

it('PAY-008 / ACC-004: an authorized historical excess receipt replays without a new collection', async () => {
  const f = fixture();
  const legacy = { ...input, depositPaisa: 1000, advanceCreditPaisa: 1 };
  await new IdempotencyService(f.store, () => now).execute(
    { actor, key: ids.command, endpoint: 'POST Stay external payment', status: 201 },
    { branchId: ids.branch, stayId: ids.stay },
    legacy,
    recordedResidentPaymentSchema,
    async () => true,
    async () => result,
  );
  expect((await call(f, legacy)).replayed).toBe(true);
  expect(f.authorize).toHaveBeenCalledTimes(1);
  expect(f.record).not.toHaveBeenCalled();
});
