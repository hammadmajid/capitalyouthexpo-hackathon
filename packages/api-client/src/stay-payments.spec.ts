import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { recordStayExternalPayment as record } from './stay-payments.js';
const branch = '10000000-0000-4000-8000-000000000001';
const stay = '10000000-0000-4000-8000-000000000002';
const key = '10000000-0000-4000-8000-000000000003';
const invoice = '10000000-0000-4000-8000-000000000004';
const result = {
  paymentId: key,
  receiptId: invoice,
  receiptNumber: 'REC-2028-0001',
  amountPaisa: 1001,
};
const input = {
  amountPaisa: 1001,
  method: 'cash',
  paidOn: '2028-03-01',
  note: 'Hostel received cash',
  allocations: [{ invoiceId: invoice, amountPaisa: 800 }],
  depositPaisa: 201,
  advanceCreditPaisa: 0,
};
function fixture(cookie = false) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(result, { status: 201 }));
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch,
    authentication: cookie
      ? { kind: 'cookie', csrf: () => 'fixture-csrf' }
      : { kind: 'bearer', accessToken: async () => 'fixture-access' },
  });
  return { fetch, client };
}
function request(f: ReturnType<typeof fixture>, index = 0) {
  const sent = f.fetch.mock.calls.at(index)?.[0];
  if (!(sent instanceof Request)) throw Error('Expected actual SDK Request');
  return sent;
}
it.each([false, true])(
  'PAY-008 / SEC-003: exact branch/Stay external payment preserves integer allocation and authority; cookie=%s',
  async (cookie) => {
    const f = fixture(cookie);
    expect(
      await record(
        f.client,
        branch.toUpperCase(),
        stay,
        { ...input, note: ' Hostel received cash ' },
        key,
      ),
    ).toEqual(result);
    expect(request(f).method).toBe('POST');
    expect(request(f).url).toBe(
      'https://api.example.test/v1/branches/' + branch + '/stays/' + stay + '/payments',
    );
    expect(request(f).headers.get('idempotency-key')).toBe(key);
    expect(request(f).headers.get(cookie ? 'x-csrf-token' : 'authorization')).toBe(
      cookie ? 'fixture-csrf' : 'Bearer fixture-access',
    );
    expect(await request(f).json()).toEqual(input);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  },
);
it('PAY-008: optional proof identifier and reference remain explicit; no inferred invoice-paid state', async () => {
  const f = fixture();
  const body = { ...input, proofFileId: key, transactionReference: '  bank-123  ' };
  expect(await record(f.client, branch, stay, body, key)).toEqual(result);
  expect(await request(f).json()).toEqual({ ...body, transactionReference: 'bank-123' });
});
it.each([
  { ...input, amountPaisa: 0 },
  { ...input, amountPaisa: 1001.5 },
  { ...input, amountPaisa: Number.MAX_SAFE_INTEGER + 1 },
  { ...input, depositPaisa: 202 },
  { ...input, amountPaisa: 1002, advanceCreditPaisa: 1 },
  { ...input, advanceCreditPaisa: -1 },
  { ...input, allocations: [...input.allocations, ...input.allocations] },
  { ...input, method: 'platform_wallet' },
  { ...input, note: '' },
  { ...input, paidOn: '0000-01-01' },
  { ...input, proofFileId: 'foreign-id' },
  { ...input, approved: true },
  { ...input, actorUserId: key },
  { ...input, paid: true },
])('PAY-008 / ACC-003: invalid financial command rejects before transport %#', async (body) => {
  const f = fixture();
  await expect(record(f.client, branch, stay, body, key)).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
it.each(['branch', 'stay', 'key'] as const)(
  'SEC-003: invalid %s identifier never reaches transport',
  async (field) => {
    const f = fixture();
    await expect(
      record(
        f.client,
        field === 'branch' ? 'bad' : branch,
        field === 'stay' ? 'bad' : stay,
        input,
        field === 'key' ? 'bad' : key,
      ),
    ).rejects.toThrow();
    expect(f.fetch).not.toHaveBeenCalled();
  },
);
it.each([
  { ...result, receiptId: undefined },
  { ...result, receiptNumber: '' },
  { ...result, amountPaisa: 1002 },
  { ...result, amountPaisa: 1001.5 },
  { ...result, amountPaisa: 0 },
  { ...result, paymentId: 'bad' },
  { ...result, residentName: 'private' },
  { ...result, paid: true },
])(
  'ACC-003 / SEC-003: invalid, wrong-amount or privacy-expanded result is not accepted %#',
  async (response) => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(Response.json(response, { status: 201 }));
    await expect(record(f.client, branch, stay, input, key)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  },
);
it('ACC-004: lost result does not auto-retry; explicit retry uses original caller command/key', async () => {
  const f = fixture();
  f.fetch.mockRejectedValueOnce(Error('Disconnected'));
  await expect(record(f.client, branch, stay, input, key)).rejects.toMatchObject({
    code: 'NETWORK_UNAVAILABLE',
  });
  expect(f.fetch).toHaveBeenCalledTimes(1);
  await record(f.client, branch, stay, input, key);
  expect(request(f, 1).headers.get('idempotency-key')).toBe(
    request(f).headers.get('idempotency-key'),
  );
  expect(await request(f, 1).json()).toEqual(await request(f).json());
});
it('SEC-003: server denial remains a typed failure, never a recorded payment', async () => {
  const f = fixture();
  f.fetch.mockResolvedValueOnce(
    Response.json(
      {
        type: 'urn:hsm:error:forbidden',
        title: 'Request failed',
        detail: 'Request failed',
        status: 403,
        code: 'FORBIDDEN',
        traceId: 'fixture',
      },
      { status: 403 },
    ),
  );
  await expect(record(f.client, branch, stay, input, key)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
