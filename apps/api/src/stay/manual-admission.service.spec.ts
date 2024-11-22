import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { manualAdmissionServiceFixture as fixture } from '../../test/unit/stay-manual-admission-service.fixture.js';
import {
  admissionIds as ids,
  admissionCommand as input,
  admissionResult as result,
} from '../../test/unit/stay-manual-admission.fixture.js';
import { paymentActor as actor } from '../../test/unit/stay-payment.fixture.js';
function call(
  f: ReturnType<typeof fixture>,
  body: unknown = input,
  key: unknown = ids.command,
  branch: unknown = ids.branch,
) {
  return f.service.admit(actor, key, branch, body);
}
it('STAY-001 / ACC-004: normalized retry returns original admission only after current authority', async () => {
  const f = fixture();
  expect(
    await call(
      f,
      {
        ...input,
        manual: {
          ...input.manual,
          resident: { kind: 'new', profile: { displayName: '  Offline resident  ' } },
        },
      },
      ids.command.toUpperCase(),
      ids.branch.toUpperCase(),
    ),
  ).toEqual({ status: 201, body: result, replayed: false });
  expect((await call(f)).replayed).toBe(true);
  expect(f.admit).toHaveBeenCalledTimes(1);
  expect(f.authorize).toHaveBeenCalledTimes(2);
  expect(f.admit).toHaveBeenCalledWith(f.query.transaction, actor, ids.branch, input, null);
  f.authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Grant revoked'));
  await expect(call(f)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.admit).toHaveBeenCalledTimes(1);
});
it.each(['branch', 'profile', 'terms', 'selection', 'target'] as const)(
  'ACC-004: command key cannot alias changed %s',
  async (changed) => {
    const f = fixture();
    await call(f);
    let body = input,
      branch = ids.branch;
    if (changed === 'branch') branch = randomUUID();
    if (changed === 'profile')
      body = {
        ...input,
        manual: {
          ...input.manual,
          resident: { kind: 'new', profile: { displayName: 'Another resident' } },
        },
      };
    if (changed === 'terms')
      body = {
        ...input,
        manual: { ...input.manual, terms: { ...input.manual.terms, rentAmountPaisa: 1800002 } },
      };
    if (changed === 'selection')
      body = { ...input, initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 1 }] };
    if (changed === 'target')
      body = { ...input, manual: { ...input.manual, target: { kind: 'room', roomId: ids.room } } };
    await expect(call(f, body, ids.command, branch)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(f.admit).toHaveBeenCalledTimes(1);
  },
);
it.each([
  { branchId: randomUUID() },
  { stayId: 'bad' },
  { state: 'paid' },
  { version: 2 },
  { userId: ids.customer },
])('SEC-003: mismatched or private producer result %# is never cached', async (patch) => {
  const f = fixture();
  f.admit.mockResolvedValue({ ...result, ...patch } as typeof result);
  await expect(call(f)).rejects.toMatchObject({ code: 'INTERNAL', status: 500 });
  expect(f.responses.size).toBe(0);
});
it('RES-003 / SEC-003: an explicit existing resident must match both new and replayed responses', async () => {
  const f = fixture(),
    body = {
      ...input,
      manual: { ...input.manual, resident: { kind: 'existing', residentId: ids.resident } },
    };
  await call(f, body);
  const row = f.responses.get(ids.command);
  if (!row) throw Error('Response absent');
  f.responses.set(ids.command, { ...row, responseBody: { ...result, residentId: randomUUID() } });
  await expect(call(f, body)).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(f.admit).toHaveBeenCalledTimes(1);
});
it('RES-003 / SEC-003: wrong newly produced existing resident fails closed', async () => {
  const f = fixture(),
    body = {
      ...input,
      manual: { ...input.manual, resident: { kind: 'existing', residentId: randomUUID() } },
    };
  await expect(call(f, body)).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(f.responses.size).toBe(0);
});
it('SEC-003: malformed key, branch, body or injected role fails before preflight', async () => {
  const f = fixture();
  await expect(call(f, input, 'bad')).rejects.toThrow();
  await expect(call(f, input, ids.command, 'bad')).rejects.toThrow();
  await expect(call(f, { ...input, initialBilling: [] })).rejects.toThrow();
  await expect(call(f, { ...input, scope: { actorRole: 'owner' } })).rejects.toThrow();
  expect(f.context).not.toHaveBeenCalled();
});
it('STAY-001 / AUD-004: mandatory transaction failure is not cached and identical retry remains possible', async () => {
  const f = fixture();
  f.admit.mockRejectedValueOnce(Error('Required admission audit failed'));
  await expect(call(f)).rejects.toThrow('Required admission audit failed');
  expect(f.responses.size).toBe(0);
  expect((await call(f)).body).toEqual(result);
});
it('ACC-002: preflight denial stops idempotency and admission', async () => {
  const f = fixture();
  f.context.mockRejectedValue(new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable'));
  await expect(call(f)).rejects.toMatchObject({ code: 'BRANCH_FORBIDDEN' });
  expect(f.authorize).not.toHaveBeenCalled();
  expect(f.admit).not.toHaveBeenCalled();
});
