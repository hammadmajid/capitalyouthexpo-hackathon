import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import {
  canAssociateEmail,
  requestEmailAssociation,
  verifyEmailAssociation,
  checkEmailAssociation,
} from './email-association.js';
const id = '550e8400-e29b-41d4-a716-446655440000';
const profile = () => ({
  user: {
    id,
    fullName: 'Manager',
    email: 'manager@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: {
    customer: false,
    owner: false,
    managerOf: [{ branchId: id, branchName: 'Original branch' }],
    admin: null,
  },
});
function wire(value: unknown, bearer = false) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: bearer
      ? { kind: 'bearer', accessToken: async () => 'access' }
      : { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(value);
    },
  });
  return { client, requests };
}
it.each([false, true])(
  'AUTH-M SEC: request preserves protected cookie/bearer transport (%s) and normalizes only email',
  async (bearer) => {
    const w = wire({ accepted: true }, bearer);
    expect(
      await requestEmailAssociation(w.client, {
        email: ' MANAGER@example.test ',
        currentPassword: 'Exact protected phrase ',
      }),
    ).toBe('manager@example.test');
    const request = w.requests[0];
    expect(request?.url).toBe('https://api.example.test/v1/auth/email/associate');
    expect(request?.method).toBe('POST');
    expect(request?.headers.get('authorization')).toBe(bearer ? 'Bearer access' : null);
    expect(request?.headers.get('x-csrf-token')).toBe(bearer ? null : 'csrf');
    expect(request?.credentials).toBe(bearer ? 'omit' : 'include');
    expect(await request?.json()).toEqual({
      email: 'manager@example.test',
      currentPassword: 'Exact protected phrase ',
    });
  },
);
it('AUTH-M: one-use verification and lost-response reconciliation return only the same verified identity', async () => {
  const w = wire(profile());
  expect(await verifyEmailAssociation(w.client, id, 'MANAGER@example.test', '123456')).toEqual(
    profile(),
  );
  expect(await w.requests[0]?.json()).toEqual({ email: 'manager@example.test', code: '123456' });
  expect(w.requests[0]?.url).toBe('https://api.example.test/v1/auth/email/associate/verify');
  expect(await checkEmailAssociation(w.client, id, 'MANAGER@example.test')).toEqual(profile());
  expect(w.requests[1]?.url).toBe('https://api.example.test/v1/me');
  expect(w.requests[1]?.method).toBe('GET');
  expect(w.requests[1]?.headers.has('x-csrf-token')).toBe(false);
});
it.each(['foreign-id', 'foreign-email', 'unverified'] as const)(
  'SEC: %s projection fails both verification and reconciliation',
  async (kind) => {
    const p = profile();
    if (kind === 'foreign-id') p.user.id = '550e8400-e29b-41d4-a716-446655440001';
    if (kind === 'foreign-email') p.user.email = 'foreign@example.test';
    if (kind === 'unverified') p.user.emailVerified = false;
    const w = wire(p);
    await expect(
      verifyEmailAssociation(w.client, id, 'manager@example.test', '123456'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(checkEmailAssociation(w.client, id, 'manager@example.test')).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' },
    );
  },
);
it('SEC: invalid request, identity and proof are rejected before transport', async () => {
  const w = wire(profile());
  await expect(requestEmailAssociation(w.client, {})).rejects.toThrow();
  await expect(
    verifyEmailAssociation(w.client, 'invalid', 'manager@example.test', '123456'),
  ).rejects.toThrow();
  await expect(verifyEmailAssociation(w.client, id, 'manager@example.test', '')).rejects.toThrow();
  await expect(
    checkEmailAssociation(w.client, 'invalid', 'manager@example.test'),
  ).rejects.toThrow();
  expect(w.requests).toHaveLength(0);
});
it('SEC: availability acknowledgement and final projection reject private extra fields', async () => {
  await expect(
    requestEmailAssociation(wire({ accepted: true, userId: id }).client, {
      email: 'manager@example.test',
      currentPassword: 'Permanent phrase',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    verifyEmailAssociation(
      wire({ ...profile(), accessToken: 'private' }).client,
      id,
      'manager@example.test',
      '123456',
    ),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('AUTH-M: association admission is limited to phone-only live Manager projections', () => {
  const p = { ...profile(), user: { ...profile().user, email: null, emailVerified: false } };
  expect(canAssociateEmail(p)).toBe(true);
  expect(canAssociateEmail({ ...p, user: { ...p.user, email: 'claimed@example.test' } })).toBe(
    false,
  );
  expect(canAssociateEmail({ ...p, user: { ...p.user, emailVerified: true } })).toBe(false);
  expect(canAssociateEmail({ ...p, capabilities: { ...p.capabilities, managerOf: [] } })).toBe(
    false,
  );
});
