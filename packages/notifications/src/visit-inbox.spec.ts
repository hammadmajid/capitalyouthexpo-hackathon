import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { notifications, visitHistory, visitInterestResponses } from '@hsm/db';
import { InvalidNotificationJob, type NotificationLease } from './index.js';
import { waitlistFixture, now, lease, branchId, customerId } from '../test/waitlist.fixture.js';
const mocks = vi.hoisted(() => ({ lock: vi.fn<() => Promise<void>>() }));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  lockInventoryBranch: mocks.lock,
}));
beforeEach(() => {
  mocks.lock.mockReset().mockResolvedValue(undefined);
});
const visitId = randomUUID(),
  historyId = randomUUID();
function fixture() {
  const input: NotificationLease = {
    ...lease,
    eventType: 'notification.create',
    recipientUserId: customerId,
    payload: { event: 'visit.follow_up', operationId: historyId },
  };
  const f = waitlistFixture(input);
  f.data.set(visitHistory, [
    {
      visitId,
      branchId,
      customerUserId: customerId,
      status: 'completed',
      action: 'complete',
      followUpSentAt: now,
    },
  ]);
  return { ...f, input };
}
it.each([false, true])(
  'VISIT-001: final prompt publication rechecks an explicit response (%s)',
  async (answered) => {
    const f = fixture();
    if (answered) f.data.set(visitInterestResponses, [{ id: randomUUID() }]);
    expect(await f.repository.publish(f.input, now)).toBe(true);
    expect(mocks.lock).toHaveBeenCalledWith(f.tx, branchId);
    expect(f.writes.filter((write) => write.table === notifications)).toHaveLength(
      answered ? 0 : 1,
    );
    expect(f.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', leaseToken: null }),
    );
  },
);
it('VISIT-001 / SEC-003: another account cannot receive a source-bound private follow-up', async () => {
  const f = fixture();
  f.data.set(visitHistory, [
    {
      visitId,
      branchId,
      customerUserId: randomUUID(),
      status: 'completed',
      action: 'complete',
      followUpSentAt: now,
    },
  ]);
  expect(await f.repository.publish(f.input, now)).toBe(true);
  expect(f.writes).toHaveLength(0);
});
it('VISIT-001: a fabricated history cannot become a final prompt', async () => {
  const f = fixture();
  f.data.set(visitHistory, []);
  await expect(f.repository.publish(f.input, now)).rejects.toBeInstanceOf(InvalidNotificationJob);
  expect(f.set).not.toHaveBeenCalled();
});
