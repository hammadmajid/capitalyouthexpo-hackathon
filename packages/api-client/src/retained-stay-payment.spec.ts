import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { RetainedStayPayment } from './retained-stay-payment.js';
const branch = '10000000-0000-4000-8000-000000000001';
const stay = '10000000-0000-4000-8000-000000000002';
const invoice = '10000000-0000-4000-8000-000000000003';
const result = { paymentId: branch, receiptId: stay, receiptNumber: 'R-1', amountPaisa: 1001 };
const input = {
  amountPaisa: 1001,
  method: 'cash',
  paidOn: '2028-03-01',
  note: 'Paid directly',
  allocations: [{ invoiceId: invoice, amountPaisa: 1001 }],
  depositPaisa: 0,
  advanceCreditPaisa: 0,
};
function fixture() {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(result, { status: 201 }));
  const createKey = vi.fn<() => string>(() => randomUUID()),
    command = new RetainedStayPayment(branch, stay, createKey);
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch,
    authentication: { kind: 'bearer', accessToken: async () => 'fixture-access' },
  });
  return { fetch, createKey, command, client };
}
function problem(status: number) {
  return Response.json(
    {
      type: 'urn:hsm:error:conflict',
      title: 'Request failed',
      detail: 'Request failed',
      status,
      code: 'CONFLICT',
      traceId: 'fixture-request',
    },
    { status },
  );
}
function sent(f: ReturnType<typeof fixture>, second = false) {
  const request = second ? f.fetch.mock.calls[1]?.[0] : f.fetch.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw Error('Actual Request missing');
  return request;
}
it('PAY-008 / ACC-004: successful posting retains immutable nested allocations and is never resent', async () => {
  const f = fixture();
  expect(f.command.locked).toBe(false);
  expect(f.command.uncertain).toBe(false);
  expect(f.command.command).toBeUndefined();
  expect(f.command.result).toBeUndefined();
  expect(await f.command.submit(f.client, input)).toEqual(result);
  expect(f.command.result).toEqual(result);
  expect(f.command.locked).toBe(true);
  expect(Object.isFrozen(f.command.command)).toBe(true);
  expect(Object.isFrozen(f.command.command?.allocations)).toBe(true);
  expect(Object.isFrozen(f.command.command?.allocations[0])).toBe(true);
  expect(Object.isFrozen(input.allocations)).toBe(false);
  await expect(f.command.submit(f.client, input)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  expect(f.fetch).toHaveBeenCalledTimes(1);
  expect(sent(f).url).toContain('/branches/' + branch + '/stays/' + stay + '/payments');
});
it.each([400, 401, 403, 409, 429])(
  'ACC-004: first definite HTTP%s rejection unlocks a new deliberate command',
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
  'ACC-004: uncertain %s outcome preserves exact original command and key',
  async (failure) => {
    const f = fixture();
    if (failure === 'network') f.fetch.mockRejectedValueOnce(Error('Disconnected'));
    if (failure === 'malformed')
      f.fetch.mockResolvedValueOnce(Response.json({ ...result, amountPaisa: 2 }, { status: 201 }));
    if (failure === 'server') f.fetch.mockResolvedValueOnce(problem(503));
    await expect(f.command.submit(f.client, input)).rejects.toThrow();
    expect(f.command.uncertain).toBe(true);
    await expect(
      f.command.submit(f.client, { ...input, note: 'Changed command' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await f.command.submit(f.client, { ...input });
    expect(f.createKey).toHaveBeenCalledTimes(1);
    expect(sent(f).headers.get('idempotency-key')).toBe(
      sent(f, true).headers.get('idempotency-key'),
    );
    expect(await sent(f).clone().json()).toEqual(await sent(f, true).clone().json());
    expect(f.command.uncertain).toBe(false);
  },
);
it('ACC-004: a later rejection cannot unlock an already uncertain payment', async () => {
  const f = fixture();
  f.fetch.mockRejectedValueOnce(Error('Disconnected')).mockResolvedValueOnce(problem(409));
  await expect(f.command.submit(f.client, input)).rejects.toThrow();
  await expect(f.command.submit(f.client, input)).rejects.toThrow();
  expect(f.command.locked).toBe(true);
  expect(f.command.uncertain).toBe(true);
  await f.command.submit(f.client, input);
  expect(f.createKey).toHaveBeenCalledTimes(1);
});
it('ACC-004: concurrent submit cannot start a second request', async () => {
  const f = fixture();
  let complete: (response: Response) => void = () => {
    throw Error('Pending fixture missing');
  };
  f.fetch.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  const first = f.command.submit(f.client, input);
  await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
  await expect(f.command.submit(f.client, input)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  complete(Response.json(result, { status: 201 }));
  await first;
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
it('SEC-003: malformed scope, draft and generated key fail before transport', async () => {
  expect(() => new RetainedStayPayment('bad', stay, randomUUID)).toThrow();
  expect(() => new RetainedStayPayment(branch, 'bad', randomUUID)).toThrow();
  const f = fixture();
  await expect(f.command.submit(f.client, { ...input, amountPaisa: 1 })).rejects.toThrow();
  f.createKey.mockReturnValueOnce('bad');
  await expect(f.command.submit(f.client, input)).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.command.locked).toBe(false);
});
