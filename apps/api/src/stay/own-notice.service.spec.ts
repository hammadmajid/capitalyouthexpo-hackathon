import { expect, it } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { ownNoticeServiceFixture as fixture } from '../../test/unit/stay-own-notice-service.fixture.js';
import {
  noticeActor as actor,
  noticeIds as ids,
  noticeInput as input,
  noticeResult as result,
} from '../../test/unit/stay-own-notice.fixture.js';
function call(
  f: ReturnType<typeof fixture>,
  body: unknown = input,
  key: unknown = ids.key,
  stay: unknown = ids.stay,
) {
  return f.service.submit(actor, key, stay, body);
}
it('OUT-001 / ACC-004: exact normalized own notice replays only after current authority and never advances state twice', async () => {
  const f = fixture();
  expect(
    await call(
      f,
      { ...input, reason: '  Travel plans changed  ' },
      ids.key.toUpperCase(),
      ids.stay.toUpperCase(),
    ),
  ).toEqual({ status: 201, body: result, replayed: false });
  expect((await call(f)).replayed).toBe(true);
  expect(f.submit).toHaveBeenCalledExactlyOnceWith(f.query.transaction, actor, ids.stay, input);
  expect(f.authorize).toHaveBeenCalledTimes(2);
  f.authorize.mockRejectedValueOnce(new DomainError('NOT_FOUND', 404, 'Stay unavailable'));
  await expect(call(f)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(f.submit).toHaveBeenCalledTimes(1);
});
it.each([
  { requestedCheckoutDate: '2028-03-02' },
  { expectedVersion: 2 },
  { isEmergency: false },
  { reason: 'A different explicit plan' },
])('ACC-004: one key cannot alias a different notice body: %j', async (change) => {
  const f = fixture();
  await call(f);
  await expect(call(f, { ...input, ...change })).rejects.toMatchObject({
    code: 'IDEMPOTENCY_KEY_REUSED',
  });
  expect(f.submit).toHaveBeenCalledTimes(1);
});
it('ACC-004: one key cannot alias another own Stay target', async () => {
  const f = fixture();
  await call(f);
  await expect(call(f, input, ids.key, ids.policy)).rejects.toMatchObject({
    code: 'IDEMPOTENCY_KEY_REUSED',
  });
});
it.each([
  { stayId: ids.policy },
  { version: 3 },
  { state: 'checked_out' },
  {
    plan: {
      ...result.plan,
      requestedCheckoutDate: '2028-03-02',
      providedNoticeDays: 4,
      shortfallDays: 11,
    },
  },
  { plan: { ...result.plan, isEmergency: false } },
  { actorUserId: actor.userId },
])('SEC-003: inconsistent or privacy-expanded producer result is not cached: %j', async (patch) => {
  const f = fixture();
  f.submit.mockResolvedValueOnce({ ...result, ...patch });
  await expect(call(f)).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(f.responses.size).toBe(0);
});
it.each([
  { ...input, userId: actor.userId },
  { ...input, branchId: ids.branch },
  { ...input, actorRole: 'owner' },
  { ...input, releaseInventory: true },
  { ...input, feePaisa: 1 },
  { ...input, isEmergency: true, reason: '' },
  { ...input, requestedCheckoutDate: '2028-02-30' },
])(
  'OUT-001 / SEC-003: invalid or authority-expanded request is rejected before storage: %j',
  async (body) => {
    const f = fixture();
    await expect(call(f, body)).rejects.toThrow();
    expect(f.authorize).not.toHaveBeenCalled();
    expect(f.submit).not.toHaveBeenCalled();
    expect(f.responses.size).toBe(0);
  },
);
it.each([
  { key: 'bad', stay: ids.stay },
  { key: ids.key, stay: 'bad' },
])('SEC-003: malformed identifiers do not reach authority or persistence', async (value) => {
  const f = fixture();
  await expect(call(f, input, value.key, value.stay)).rejects.toThrow();
  expect(f.authorize).not.toHaveBeenCalled();
});
it('ACC-004: failed transaction work cannot become a successful stored response', async () => {
  const f = fixture();
  f.submit.mockRejectedValueOnce(Error('Transaction failed'));
  await expect(call(f)).rejects.toThrow('Transaction failed');
  expect(f.responses.size).toBe(0);
  expect((await call(f)).replayed).toBe(false);
});
