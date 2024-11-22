import { beforeEach, expect, it, vi } from 'vitest';
import { recordResidentNotice } from '@hsm/db';
import { NotificationProducer } from '@hsm/notifications';
import { lockOwnNoticeAuthority } from './own-notice.scope.js';
import { OwnStayNoticeRepository } from './own-notice.repository.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  noticeActor as actor,
  noticeIds as ids,
  noticeNow as now,
  noticeInput as notice,
  noticeResult as result,
} from '../../test/unit/stay-own-notice.fixture.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  recordResidentNotice: vi.fn(),
}));
vi.mock('./own-notice.scope.js', () => ({ lockOwnNoticeAuthority: vi.fn() }));
const source = {
  scope: {
    branchId: ids.branch,
    stayId: ids.stay,
    actorUserId: actor.userId,
    actorRole: 'customer' as const,
  },
  notice,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockOwnNoticeAuthority).mockResolvedValue({
    id: ids.stay,
    branchId: ids.branch,
    userId: actor.userId,
  });
  vi.mocked(recordResidentNotice).mockResolvedValue(result);
});
function fixture() {
  const f = queryFixture(),
    producer = new NotificationProducer(),
    enqueue = vi.spyOn(producer, 'enqueue').mockResolvedValue(undefined);
  return { ...f, enqueue, repo: new OwnStayNoticeRepository(producer, () => now) };
}
it('OUT-001 / ACC-004: notice uses the existing coordinator and exact authorized business transaction', async () => {
  const f = fixture();
  expect(await f.repo.submit(f.transaction, actor, ids.stay, notice)).toEqual(result);
  expect(recordResidentNotice).toHaveBeenCalledWith(
    f.transaction,
    source,
    now,
    expect.any(Function),
    expect.any(Function),
  );
  const authorize = vi.mocked(recordResidentNotice).mock.calls[0]?.[3];
  if (!authorize) throw Error('Required authorizer missing');
  await authorize(f.transaction, source.scope, now);
  expect(lockOwnNoticeAuthority).toHaveBeenCalledTimes(2);
});
it('ACC-004: successful replay still requires current own-Stay authority', async () => {
  const f = fixture();
  expect(await f.repo.authorize(f.transaction, actor, ids.stay)).toBe(true);
  expect(recordResidentNotice).not.toHaveBeenCalled();
});
it.each(['transaction', 'branch', 'stay', 'actor', 'role', 'clock'] as const)(
  'SEC-003: notice authorizer cannot be transplanted to another %s',
  async (field) => {
    const f = fixture();
    await f.repo.submit(f.transaction, actor, ids.stay, notice);
    const authorize = vi.mocked(recordResidentNotice).mock.calls[0]?.[3];
    if (!authorize) throw Error('Required authorizer missing');
    const tx = field === 'transaction' ? queryFixture().transaction : f.transaction,
      scope = {
        ...source.scope,
        ...(field === 'branch' ? { branchId: ids.policy } : {}),
        ...(field === 'stay' ? { stayId: ids.policy } : {}),
        ...(field === 'actor' ? { actorUserId: ids.policy } : {}),
        ...(field === 'role' ? { actorRole: 'manager' as const } : {}),
      };
    await expect(
      authorize(tx, scope, field === 'clock' ? new Date(now.getTime() + 1) : now),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  },
);
it('OUT-001: a changed actual branch during coordinator authorization fails closed', async () => {
  const f = fixture();
  await f.repo.submit(f.transaction, actor, ids.stay, notice);
  const authorize = vi.mocked(recordResidentNotice).mock.calls[0]?.[3];
  if (!authorize) throw Error('Required authorizer missing');
  vi.mocked(lockOwnNoticeAuthority).mockResolvedValueOnce({
    id: ids.stay,
    branchId: ids.policy,
    userId: actor.userId,
  });
  await expect(authorize(f.transaction, source.scope, now)).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});
it('OUT-001 / NTF-002: mandatory notice delivery binds the same transaction and actual linked recipient', async () => {
  const f = fixture();
  await f.repo.submit(f.transaction, actor, ids.stay, notice);
  const publish = vi.mocked(recordResidentNotice).mock.calls[0]?.[4];
  if (!publish) throw Error('Required publisher missing');
  await publish(
    f.transaction,
    { userId: actor.userId, stayId: ids.stay, noticeId: ids.notice },
    now,
  );
  expect(f.enqueue).toHaveBeenCalledExactlyOnceWith(
    f.transaction,
    { userId: actor.userId, event: 'resident.notice_submitted', operationId: ids.notice },
    now,
  );
});
it.each(['transaction', 'user', 'stay', 'clock'] as const)(
  'SEC-003: publisher cannot accept a different %s',
  async (field) => {
    const f = fixture();
    await f.repo.submit(f.transaction, actor, ids.stay, notice);
    const publish = vi.mocked(recordResidentNotice).mock.calls[0]?.[4];
    if (!publish) throw Error('Required publisher missing');
    const tx = field === 'transaction' ? queryFixture().transaction : f.transaction;
    await expect(
      publish(
        tx,
        {
          userId: field === 'user' ? ids.policy : actor.userId,
          stayId: field === 'stay' ? ids.policy : ids.stay,
          noticeId: ids.notice,
        },
        field === 'clock' ? new Date(now.getTime() + 1) : now,
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(f.enqueue).not.toHaveBeenCalled();
  },
);
it('ACC-004: a failed mandatory enqueue propagates instead of reporting a committed notice', async () => {
  const f = fixture();
  await f.repo.submit(f.transaction, actor, ids.stay, notice);
  const publish = vi.mocked(recordResidentNotice).mock.calls[0]?.[4];
  if (!publish) throw Error('Required publisher missing');
  f.enqueue.mockRejectedValueOnce(Error('Outbox unavailable'));
  await expect(
    publish(f.transaction, { userId: actor.userId, stayId: ids.stay, noticeId: ids.notice }, now),
  ).rejects.toThrow('Outbox unavailable');
});
