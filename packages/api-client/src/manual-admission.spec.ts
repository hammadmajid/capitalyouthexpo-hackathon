import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { createManualStay } from './manual-admission.js';
const id = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const input = {
  manual: {
    resident: { kind: 'new', profile: { displayName: '  Offline resident  ' } },
    target: { kind: 'bed', roomId: id, bedId: id },
    period: { moveInDate: '2028-02-01', expectedLeaveDate: '2028-03-01' },
    terms: {
      policyVersionId: id,
      currency: 'PKR',
      rentAmountPaisa: 1800001,
      depositPaisa: 1000001,
      fees: [],
      catalog: [],
      policy: {
        cycle: { kind: 'calendar_month', dueDay: 5 },
        proration: { kind: 'full_period' },
        graceDays: 0,
        lateCharge: { kind: 'disabled' },
        noticeDays: 15,
        earlyCheckout: { kind: 'manual' },
        allowOpenEnded: false,
        customCharges: 'disabled',
      },
    },
  },
  initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0 }],
};
const result = {
  branchId: id,
  stayId: id,
  residentId: id,
  agreementId: id,
  assignmentId: id,
  state: 'active',
  version: 1,
};
function fixture(data: unknown = result, status = 201, cookie = false) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: cookie
        ? { kind: 'cookie', csrf: () => 'csrf-pair' }
        : { kind: 'bearer', accessToken: async () => 'private-access' },
      fetch,
    }),
  };
}
it('STAY-001 / ACC-004: strict command uses exact generated private route, explicit key and normalized original terms', async () => {
  const f = fixture();
  expect(await createManualStay(f.client, id, input, id)).toEqual(result);
  const request = f.fetch.mock.calls[0]?.[0] as Request;
  expect(request.method).toBe('POST');
  expect(request.url).toBe('https://api.example.test/v1/branches/' + id + '/stays/manual');
  expect(request.headers.get('authorization')).toBe('Bearer private-access');
  expect(request.headers.get('idempotency-key')).toBe(id);
  expect(await request.json()).toEqual({
    ...input,
    manual: {
      ...input.manual,
      resident: { kind: 'new', profile: { displayName: 'Offline resident' } },
    },
  });
});
it('SEC-003: cookie command retains existing CSRF transport', async () => {
  const f = fixture(result, 201, true);
  await createManualStay(f.client, id, input, id);
  const request = f.fetch.mock.calls[0]?.[0] as Request;
  expect(request.headers.get('x-csrf-token')).toBe('csrf-pair');
  expect(request.credentials).toBe('include');
});
it.each([
  { branchId: other },
  { stayId: 'invalid' },
  { state: 'paid' },
  { version: 2 },
  { userId: id },
])('SEC-003: foreign, malformed or private response %# fails closed', async (patch) => {
  await expect(
    createManualStay(fixture({ ...result, ...patch }).client, id, input, id),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('RES-003: selected existing resident must match returned relationship', async () => {
  const body = {
    ...input,
    manual: { ...input.manual, resident: { kind: 'existing', residentId: other } },
  };
  await expect(createManualStay(fixture().client, id, body, id)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  expect(
    await createManualStay(fixture({ ...result, residentId: other }).client, id, body, id),
  ).toEqual({ ...result, residentId: other });
});
it('SEC-003: invalid authority, financial selection, branch or key never reaches network', async () => {
  const f = fixture();
  await expect(createManualStay(f.client, 'bad', input, id)).rejects.toThrow();
  await expect(createManualStay(f.client, id, input, 'bad')).rejects.toThrow();
  await expect(
    createManualStay(f.client, id, { ...input, initialBilling: [] }, id),
  ).rejects.toThrow();
  await expect(
    createManualStay(f.client, id, { ...input, expectedUserId: id }, id),
  ).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
it.each([401, 403, 409, 503])(
  'ACC-004: admission failure HTTP%s never fabricates an active Stay',
  async (status) => {
    await expect(
      createManualStay(fixture({ error: 'denied' }, status).client, id, input, id),
    ).rejects.toThrow();
  },
);
it('ACC-004: callers can retry the same intent with the same command key', async () => {
  const f = fixture();
  await createManualStay(f.client, id, input, id);
  await createManualStay(f.client, id, input, id);
  expect(f.fetch.mock.calls).toHaveLength(2);
  for (const call of f.fetch.mock.calls)
    expect((call[0] as Request).headers.get('idempotency-key')).toBe(id);
});

it.each([
  { feeBilling: { oneTimeDueOffsetDays: 2 } },
  {
    feeBilling: {
      oneTimeDueOffsetDays: 2,
      monthly: {
        cycle: { kind: 'anniversary_month', dueOffsetDays: 0 },
        proration: { kind: 'full_period' },
      },
    },
  },
])(
  'RENT-003 / FIN-004: explicit fee-timing shape %# survives generated transport',
  async ({ feeBilling }) => {
    const f = fixture(),
      body = {
        ...input,
        manual: {
          ...input.manual,
          terms: { ...input.manual.terms, policy: { ...input.manual.terms.policy, feeBilling } },
        },
      };
    await createManualStay(f.client, id, body, id);
    const request = f.fetch.mock.calls[0]?.[0] as Request;
    expect(await request.json()).toEqual({
      ...body,
      manual: {
        ...body.manual,
        resident: { kind: 'new', profile: { displayName: 'Offline resident' } },
      },
    });
  },
);
it('RES-003 / RENT-003: explicit contact and zero manual partial amount survive transport without invented values', async () => {
  const f = fixture(),
    body = {
      ...input,
      manual: {
        ...input.manual,
        resident: {
          kind: 'new',
          profile: {
            displayName: 'Offline resident',
            phone: '+923001234567',
            email: 'Resident@EXAMPLE.invalid',
          },
        },
        period: { moveInDate: '2028-02-15', expectedLeaveDate: '2028-03-01' },
        terms: {
          ...input.manual.terms,
          policy: { ...input.manual.terms.policy, proration: { kind: 'manual' } },
        },
      },
      initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: 0, manualAmountPaisa: 0 }],
    };
  await createManualStay(f.client, id, body, id);
  const request = f.fetch.mock.calls[0]?.[0] as Request;
  expect(await request.json()).toEqual({
    ...body,
    manual: {
      ...body.manual,
      resident: {
        kind: 'new',
        profile: {
          displayName: 'Offline resident',
          phone: '+923001234567',
          email: 'resident@example.invalid',
        },
      },
    },
  });
});

it('RES-001: the native CNIC photo reference reaches the exact admission wire payload', async () => {
  const f = fixture();
  await createManualStay(f.client, id, { ...input, cnicPhotoFileId: other }, id);
  const request = f.fetch.mock.calls[0]?.[0] as Request;
  expect(await request.json()).toMatchObject({ cnicPhotoFileId: other });
});
