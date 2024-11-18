import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { submitOwnStayNotice } from './own-stay-notice.js';
const stayId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const commandId = randomUUID();
const input = { expectedVersion: 1, requestedCheckoutDate: '2028-03-01', isEmergency: false };
const result = {
  noticeId: otherId,
  stayId,
  state: 'notice_given',
  version: 2,
  plan: {
    submittedOn: '2028-02-26',
    requestedCheckoutDate: '2028-03-01',
    earliestCompliantCheckoutDate: '2028-03-12',
    requiredNoticeDays: 15,
    providedNoticeDays: 4,
    shortfallDays: 11,
    isEmergency: false,
    policyVersionId: otherId,
  },
};
function fixture(body: unknown = result, status = 201, cookie = false) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(body, { status }));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      fetch,
      authentication: cookie
        ? { kind: 'cookie', csrf: () => 'fixture-csrf' }
        : { kind: 'bearer', accessToken: async () => 'fixture-access' },
    }),
  };
}
function request(f: ReturnType<typeof fixture>, second = false) {
  const value = second ? f.fetch.mock.calls[1]?.[0] : f.fetch.mock.calls[0]?.[0];
  if (!(value instanceof Request)) throw new Error('Expected an actual SDK Request');
  return value;
}
it('OUT-001 / SEC-003: generated own route retains auth, command identity and exact timing result', async () => {
  const f = fixture();
  expect(await submitOwnStayNotice(f.client, stayId, input, commandId)).toEqual(result);
  const sent = request(f);
  expect(sent.url).toBe('https://api.example.test/v1/me/stays/' + stayId + '/checkout-request');
  expect(sent.method).toBe('POST');
  expect(sent.headers.get('authorization')).toBe('Bearer fixture-access');
  expect(sent.headers.get('idempotency-key')).toBe(commandId);
  expect(await sent.json()).toEqual(input);
});
it('SEC-003: cookie notice retains CSRF and explicitly normalizes an optional reason', async () => {
  const f = fixture(result, 201, true);
  await submitOwnStayNotice(f.client, stayId, { ...input, reason: '  Travel plans  ' }, commandId);
  expect(request(f).credentials).toBe('include');
  expect(request(f).headers.get('x-csrf-token')).toBe('fixture-csrf');
  expect(await request(f).json()).toEqual({ ...input, reason: 'Travel plans' });
});
it('OUT-002: emergency reason and original supplied command are retained', async () => {
  const f = fixture({ ...result, plan: { ...result.plan, isEmergency: true } });
  const notice = { ...input, isEmergency: true, reason: 'Family emergency' };
  await submitOwnStayNotice(f.client, stayId, notice, commandId);
  expect(await request(f).json()).toEqual(notice);
});
it.each([
  { stayId: otherId },
  { version: 3 },
  { state: 'completed' },
  { userId: stayId },
  { plan: { ...result.plan, isEmergency: true } },
  {
    plan: {
      ...result.plan,
      requestedCheckoutDate: '2028-03-02',
      providedNoticeDays: 5,
      shortfallDays: 10,
    },
  },
  { plan: { ...result.plan, shortfallDays: 0 } },
])(
  'SEC-003: wrong operation, invalid timing or private producer fields fail closed: %#',
  async (patch) => {
    await expect(
      submitOwnStayNotice(fixture({ ...result, ...patch }).client, stayId, input, commandId),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it.each([
  { actorUserId: stayId },
  { branchId: stayId },
  { releaseInventory: true },
  { feePaisa: 1 },
  { isEmergency: true },
  { requestedCheckoutDate: '2028-02-30' },
  { expectedVersion: 0 },
])(
  'OUT-001 / SEC-003: malformed or authority-expanded request never reaches transport: %#',
  async (patch) => {
    const f = fixture();
    await expect(
      submitOwnStayNotice(f.client, stayId, { ...input, ...patch }, commandId),
    ).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  },
);
it.each([
  { stay: 'bad', key: commandId },
  { stay: stayId, key: 'bad' },
])('SEC-003: malformed target or command key is rejected before transport: %#', async (ids) => {
  const f = fixture();
  await expect(submitOwnStayNotice(f.client, ids.stay, input, ids.key)).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
it('ACC-004: unknown network outcome never invents success or replaces the caller command key', async () => {
  const f = fixture();
  f.fetch.mockRejectedValueOnce(new Error('Connection lost after submission'));
  await expect(submitOwnStayNotice(f.client, stayId, input, commandId)).rejects.toMatchObject({
    code: 'NETWORK_UNAVAILABLE',
  });
  expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(await submitOwnStayNotice(f.client, stayId, input, commandId)).toEqual(result);
  expect(request(f).headers.get('idempotency-key')).toBe(commandId);
  expect(request(f, true).headers.get('idempotency-key')).toBe(commandId);
  expect(await request(f, true).json()).toEqual(input);
});
it.each([401, 403, 409, 503])(
  'ACC-004: HTTP%s cannot fabricate a recorded notice',
  async (status) => {
    await expect(
      submitOwnStayNotice(
        fixture({ error: 'unavailable' }, status).client,
        stayId,
        input,
        commandId,
      ),
    ).rejects.toThrow();
  },
);
