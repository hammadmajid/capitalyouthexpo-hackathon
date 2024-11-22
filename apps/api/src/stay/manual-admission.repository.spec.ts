import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { admitManualResident } from '@hsm/db';
import {
  lockManualAdmissionAuthority,
  manualAdmissionCommandContext,
} from './manual-admission.scope.js';
import { StayManualAdmissionRepository } from './manual-admission.repository.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { paymentActor as actor, paymentNow as now } from '../../test/unit/stay-payment.fixture.js';
import {
  admissionIds as ids,
  admissionCommand as command,
  admissionResult as result,
  admissionAuthority as authority,
} from '../../test/unit/stay-manual-admission.fixture.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  admitManualResident: vi.fn(),
}));
vi.mock('./manual-admission.scope.js', () => ({
  lockManualAdmissionAuthority: vi.fn(),
  manualAdmissionCommandContext: vi.fn(),
}));
const source = {
  scope: {
    organizationId: authority.organizationId,
    branchId: ids.branch,
    actorUserId: actor.userId,
    actorRole: 'owner' as const,
  },
  manual: command.manual,
  initialBilling: command.initialBilling,
  expectedUserId: null,
  // CHG-054: no CNIC in this command, so none is protected.
  cnic: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockManualAdmissionAuthority).mockResolvedValue(authority);
  const { branchId: _branch, ...core } = result;
  void _branch;
  vi.mocked(admitManualResident).mockResolvedValue(core);
});
function fixture() {
  const f = queryFixture();
  return { ...f, repo: new StayManualAdmissionRepository(f.database, () => now) };
}
it('STAY-001 / SEC-003: actual admission receives server scope and a required bound authorizer in the caller transaction', async () => {
  const f = fixture();
  expect(await f.repo.admit(f.transaction, actor, ids.branch, command, null)).toEqual(result);
  expect(admitManualResident).toHaveBeenCalledWith(
    f.transaction,
    source,
    now,
    expect.any(Function),
  );
  const hook = vi.mocked(admitManualResident).mock.calls[0]?.[3];
  if (!hook) throw Error('Authorizer absent');
  await hook(f.transaction, source, now);
  expect(lockManualAdmissionAuthority).toHaveBeenCalledTimes(2);
  expect(lockManualAdmissionAuthority).toHaveBeenLastCalledWith(
    f.transaction,
    actor,
    ids.branch,
    command.manual.resident,
    expect.any(Function),
    null,
  );
});
it('ACC-004: current authority is rechecked for authorized replay', async () => {
  const f = fixture();
  expect(await f.repo.authorize(f.transaction, actor, ids.branch, command, null)).toBe(true);
  expect(lockManualAdmissionAuthority).toHaveBeenCalledWith(
    f.transaction,
    actor,
    ids.branch,
    command.manual.resident,
    expect.any(Function),
    null,
  );
  expect(admitManualResident).not.toHaveBeenCalled();
});
it.each(['transaction', 'branch', 'actor', 'organization', 'role', 'link'] as const)(
  'SEC-003: source authorizer cannot be transplanted to different %s',
  async (changed) => {
    const f = fixture();
    await f.repo.admit(f.transaction, actor, ids.branch, command, null);
    const hook = vi.mocked(admitManualResident).mock.calls[0]?.[3];
    if (!hook) throw Error('Authorizer absent');
    let input = source;
    const tx = changed === 'transaction' ? queryFixture().transaction : f.transaction;
    if (changed === 'branch')
      input = { ...source, scope: { ...source.scope, branchId: randomUUID() } };
    if (changed === 'actor')
      input = { ...source, scope: { ...source.scope, actorUserId: randomUUID() } };
    if (changed === 'organization')
      input = { ...source, scope: { ...source.scope, organizationId: randomUUID() } };
    if (changed === 'role') {
      await expect(
        hook(tx, { ...source, scope: { ...source.scope, actorRole: 'manager' } }, now),
      ).rejects.toMatchObject({ code: 'INTERNAL' });
      return;
    }
    if (changed === 'link') {
      await expect(
        hook(tx, { ...source, expectedUserId: ids.customer }, now),
      ).rejects.toMatchObject({ code: 'INTERNAL' });
      return;
    }
    await expect(hook(tx, input, now)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(lockManualAdmissionAuthority).toHaveBeenCalledTimes(1);
  },
);
it('SEC-003: authority denial prevents every admission write', async () => {
  const f = fixture();
  vi.mocked(lockManualAdmissionAuthority).mockRejectedValue(Error('Session revoked'));
  await expect(f.repo.admit(f.transaction, actor, ids.branch, command, null)).rejects.toThrow(
    'Session revoked',
  );
  expect(admitManualResident).not.toHaveBeenCalled();
});
it('SEC-003: required callback rechecks fresh authority rather than trusting preflight', async () => {
  const f = fixture();
  await f.repo.admit(f.transaction, actor, ids.branch, command, null);
  const hook = vi.mocked(admitManualResident).mock.calls[0]?.[3];
  if (!hook) throw Error('Authorizer absent');
  vi.mocked(lockManualAdmissionAuthority).mockRejectedValue(Error('Grant revoked'));
  await expect(hook(f.transaction, source, now)).rejects.toThrow('Grant revoked');
});
it('AUD-004 / NTF-002: mandatory source failure propagates to caller transaction', async () => {
  const f = fixture();
  vi.mocked(admitManualResident).mockRejectedValue(Error('Required outbox failed'));
  await expect(f.repo.admit(f.transaction, actor, ids.branch, command, null)).rejects.toThrow(
    'Required outbox failed',
  );
});
it('SEC-003: malformed source result fails rather than inventing canonical state', async () => {
  const f = fixture();
  vi.mocked(admitManualResident).mockResolvedValue({ ...result, stayId: 'invalid' });
  await expect(f.repo.admit(f.transaction, actor, ids.branch, command, null)).rejects.toThrow();
});
it('RES-003: context resolves exact explicit reference using live clock', async () => {
  const f = fixture();
  await f.repo.context(actor, ids.branch, command);
  expect(manualAdmissionCommandContext).toHaveBeenCalledWith(
    f.database,
    actor,
    ids.branch,
    command.manual.resident,
    expect.any(Function),
  );
});
