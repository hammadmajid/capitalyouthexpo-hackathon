import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { RetainedOwnStayNotice } from './retained-own-stay-notice.js';
const stayId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
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
function fixture() {
  const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => Response.json(result, { status: 201 })),
    createKey = vi.fn(randomUUID),
    command = new RetainedOwnStayNotice(stayId, createKey),
    client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch,
      authentication: { kind: 'bearer', accessToken: async () => 'fixture-access' },
    });
  return { fetch, createKey, command, client };
}
function problem(status: number) {
  return Response.json(
    {
      type: 'urn:hsm:error:forbidden',
      title: 'Request failed',
      detail: 'Request failed',
      status,
      code: 'FORBIDDEN',
      traceId: 'fixture-request',
    },
    { status },
  );
}
function sent(f: ReturnType<typeof fixture>, second = false) {
  const value = second ? f.fetch.mock.calls[1]?.[0] : f.fetch.mock.calls[0]?.[0];
  if (!(value instanceof Request)) throw Error('Actual Request missing');
  return value;
}
it('OUT-001 / ACC-004: successful notice is immutable, locked and never submitted twice', async () => {
  const f = fixture();
  expect(f.command.locked).toBe(false);
  expect(f.command.uncertain).toBe(false);
  expect(f.command.command).toBeUndefined();
  expect(f.command.result).toBeUndefined();
  expect(await f.command.submit(f.client, input)).toEqual(result);
  expect(f.command.locked).toBe(true);
  expect(f.command.result).toEqual(result);
  expect(Object.isFrozen(f.command.command)).toBe(true);
  await expect(f.command.submit(f.client, input)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
it.each([400, 401, 403, 409, 429])(
  'ACC-004: definite first HTTP%s rejection permits a fresh deliberate command',
  async (status) => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(problem(status));
    await expect(f.command.submit(f.client, input)).rejects.toThrow();
    expect(f.command.locked).toBe(false);
    expect(f.command.uncertain).toBe(false);
    await f.command.submit(f.client, input);
    expect(f.createKey).toHaveBeenCalledTimes(2);
    expect(sent(f).headers.get('idempotency-key')).not.toBe(
      sent(f, true).headers.get('idempotency-key'),
    );
  },
);
it.each(['network', 'malformed', 'server'] as const)(
  'ACC-004: uncertain %s outcome retains exact normalized command and key',
  async (failure) => {
    const f = fixture();
    if (failure === 'network') f.fetch.mockRejectedValueOnce(Error('Disconnected'));
    if (failure === 'malformed')
      f.fetch.mockResolvedValueOnce(Response.json({ ...result, version: 3 }, { status: 201 }));
    if (failure === 'server') f.fetch.mockResolvedValueOnce(problem(503));
    const body = { ...input, reason: '  Travel plans  ' };
    await expect(f.command.submit(f.client, body)).rejects.toThrow();
    expect(f.command.uncertain).toBe(true);
    expect(f.command.command).toEqual({ ...input, reason: 'Travel plans' });
    await f.command.submit(f.client, body);
    expect(f.createKey).toHaveBeenCalledTimes(1);
    expect(sent(f).headers.get('idempotency-key')).toBe(
      sent(f, true).headers.get('idempotency-key'),
    );
    expect(await sent(f, true).json()).toEqual(await sent(f).json());
  },
);
it('ACC-004 / SEC-003: later denial after an unknown outcome cannot unlock or replace the command', async () => {
  const f = fixture();
  f.fetch.mockRejectedValueOnce(Error('Disconnected')).mockResolvedValueOnce(problem(403));
  await expect(f.command.submit(f.client, input)).rejects.toThrow();
  await expect(f.command.submit(f.client, input)).rejects.toThrow();
  expect(f.command.uncertain).toBe(true);
  expect(f.command.locked).toBe(true);
  await expect(
    f.command.submit(f.client, { ...input, requestedCheckoutDate: '2028-03-02' }),
  ).rejects.toThrow();
  expect(f.fetch).toHaveBeenCalledTimes(2);
  expect(f.createKey).toHaveBeenCalledTimes(1);
});
it('ACC-004: concurrent dispatch cannot create another key or network request', async () => {
  const f = fixture();
  let complete: (value: Response) => void = () => {
    throw Error('Resolver absent');
  };
  f.fetch.mockReturnValueOnce(
    new Promise<Response>((resolve) => {
      complete = resolve;
    }),
  );
  const pending = f.command.submit(f.client, input);
  await expect(f.command.submit(f.client, input)).rejects.toThrow();
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
  complete(Response.json(result, { status: 201 }));
  await pending;
  expect(f.createKey).toHaveBeenCalledTimes(1);
});
it('SEC-003: invalid Stay or command/key cannot reach transport', async () => {
  expect(() => new RetainedOwnStayNotice('bad', randomUUID)).toThrow();
  const f = fixture();
  await expect(f.command.submit(f.client, { ...input, releaseInventory: true })).rejects.toThrow();
  expect(f.createKey).not.toHaveBeenCalled();
  const invalid = new RetainedOwnStayNotice(stayId, () => 'bad');
  await expect(invalid.submit(f.client, input)).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(invalid.locked).toBe(false);
});
