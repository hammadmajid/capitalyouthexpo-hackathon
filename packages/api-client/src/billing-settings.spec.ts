import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readBillingSettings, saveBillingSettings } from './billing-settings.js';
const branchId = '019a1234-1234-7123-8123-123456789abc',
  roomTypeId = '019a1234-1234-7123-8123-123456789abd';
const id = '019a1234-1234-7123-8123-123456789abe';
const policy = {
  cycle: { kind: 'week', dueOffsetDays: 0 },
  proration: { kind: 'full_period' },
  graceDays: 0,
  lateCharge: { kind: 'disabled' },
  noticeDays: 7,
  earlyCheckout: { kind: 'manual' },
  allowOpenEnded: true,
  customCharges: 'disabled',
};
function version(typed = false) {
  return {
    id,
    level: typed ? 'room_type' : 'branch',
    scopeId: typed ? roomTypeId : branchId,
    policy,
    createdAt: '2028-02-01T06:00:00.000Z',
  };
}
function fixture(response: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'cookie', csrf: () => 'csrf-fixture' },
    fetch,
  });
  return { fetch, client };
}
it.each([false, true])(
  'RENT-003 / ACC-004: scoped billing settings read (type=%s) uses the exact private route',
  async (typed) => {
    const target = { branchId, ...(typed ? { roomTypeId } : {}) },
      row = version(typed);
    const response = { target, canEdit: true, localVersion: row, effectiveVersion: row },
      value = fixture(response);
    expect(
      await readBillingSettings(value.client, {
        branchId: branchId.toUpperCase(),
        ...(typed ? { roomTypeId: roomTypeId.toUpperCase() } : {}),
      }),
    ).toEqual(response);
    const request = value.fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).url).toBe(
      'https://api.example.test/v1/branches/' +
        branchId +
        (typed ? '/inventory/room-types/' + roomTypeId : '') +
        '/billing-policy',
    );
  },
);
it.each([false, true])(
  'RENT-003 / SEC-003: policy save (type=%s) preserves explicit financial fields and command key',
  async (typed) => {
    const row = version(typed),
      value = fixture(row),
      target = { branchId, ...(typed ? { roomTypeId } : {}) };
    expect(await saveBillingSettings(value.client, target, { policy }, id.toUpperCase())).toEqual(
      row,
    );
    const request = value.fetch.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe('PUT');
    expect(request.headers.get('Idempotency-Key')).toBe(id);
    expect(request.headers.get('X-CSRF-Token')).toBe('csrf-fixture');
    expect(await request.json()).toEqual({ policy });
  },
);
it('RENT-001: absent financial configuration stays absent', async () => {
  const response = {
      target: { branchId },
      canEdit: false,
      localVersion: null,
      effectiveVersion: null,
    },
    value = fixture(response);
  expect(await readBillingSettings(value.client, { branchId })).toEqual(response);
});
it.each([
  { target: { branchId: roomTypeId } },
  { target: { branchId, roomTypeId } },
  { localVersion: { ...version(), scopeId: roomTypeId } },
  { localVersion: version(true) },
  { effectiveVersion: null },
  { effectiveVersion: { ...version(), id: roomTypeId } },
  { localVersion: null, effectiveVersion: { ...version(), scopeId: roomTypeId } },
  { localVersion: null, effectiveVersion: version(true) },
])(
  'ACC-004: wrong-parent, inconsistent or wrong-level billing result %j is rejected',
  async (patch) => {
    const response = {
      target: { branchId },
      canEdit: true,
      localVersion: version(),
      effectiveVersion: version(),
      ...patch,
    };
    await expect(readBillingSettings(fixture(response).client, { branchId })).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' },
    );
  },
);
it.each(['hostel', 'platform'])(
  'RENT-003: %s inherited complete policy is accepted without inventing a local override',
  async (level) => {
    const response = {
      target: { branchId },
      canEdit: false,
      localVersion: null,
      effectiveVersion: { ...version(), level, scopeId: level === 'platform' ? null : roomTypeId },
    };
    expect(await readBillingSettings(fixture(response).client, { branchId })).toEqual(response);
  },
);
it('ACC-004: write response cannot substitute another scope', async () => {
  await expect(
    saveBillingSettings(fixture(version(true)).client, { branchId }, { policy }, id),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('SEC-003 / RENT-003: invalid scope, policy or key is rejected without a network request', async () => {
  const value = fixture({});
  await expect(readBillingSettings(value.client, { branchId: 'invalid' })).rejects.toThrow();
  await expect(
    saveBillingSettings(value.client, { branchId }, { policy: { ...policy, graceDays: -1 } }, id),
  ).rejects.toThrow();
  await expect(
    saveBillingSettings(value.client, { branchId }, { policy }, 'invalid'),
  ).rejects.toThrow();
  expect(value.fetch).not.toHaveBeenCalled();
});

it.each([false, true])(
  'FIN-004: typed fee configuration (type=%s) survives cookie/CSRF serialization and strict response parsing',
  async (typed) => {
    const configured = {
      ...policy,
      feeBilling: {
        oneTimeDueOffsetDays: 2,
        monthly: {
          cycle: { kind: 'anniversary_month', dueOffsetDays: 1 },
          proration: { kind: 'calendar_days', rounding: 'down' },
        },
      },
    };
    const row = { ...version(typed), policy: configured },
      value = fixture(row),
      target = { branchId, ...(typed ? { roomTypeId } : {}) };
    expect(await saveBillingSettings(value.client, target, { policy: configured }, id)).toEqual(
      row,
    );
    const request = value.fetch.mock.calls[0]?.[0] as Request;
    expect(request.headers.get('Idempotency-Key')).toBe(id);
    expect(request.headers.get('X-CSRF-Token')).toBe('csrf-fixture');
    expect(await request.json()).toEqual({ policy: configured });
    const response = { target, canEdit: true, localVersion: row, effectiveVersion: row };
    expect(await readBillingSettings(fixture(response).client, target)).toEqual(response);
  },
);
it('FIN-004 / SEC-003: unsupported fee cadence cannot be sent or trusted in a server response', async () => {
  const invalid = {
      ...policy,
      feeBilling: {
        oneTimeDueOffsetDays: 0,
        monthly: {
          cycle: { kind: 'week', dueOffsetDays: 1 },
          proration: { kind: 'full_period' },
        },
      },
    },
    value = fixture({});
  await expect(
    saveBillingSettings(value.client, { branchId }, { policy: invalid }, id),
  ).rejects.toThrow();
  expect(value.fetch).not.toHaveBeenCalled();
  await expect(
    saveBillingSettings(
      fixture({ ...version(), policy: invalid }).client,
      { branchId },
      { policy },
      id,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

it.each([undefined, { oneTimeDueOffsetDays: 0, monthly: undefined }])(
  'FIN-004: explicit undefined optional fee fields are omitted from exact wire properties (%#)',
  async (feeBilling) => {
    const normalized =
        feeBilling === undefined ? policy : { ...policy, feeBilling: { oneTimeDueOffsetDays: 0 } },
      row = { ...version(), policy: normalized },
      value = fixture(row);
    expect(
      await saveBillingSettings(
        value.client,
        { branchId },
        { policy: { ...policy, feeBilling } },
        id,
      ),
    ).toEqual(row);
    const request = value.fetch.mock.calls[0]?.[0] as Request;
    expect(await request.json()).toEqual({ policy: normalized });
  },
);
