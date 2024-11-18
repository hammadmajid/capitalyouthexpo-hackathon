import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { ownerSetupActions } from './owner-setup.js';
import { removeOwnerManager, listOwnerManagers, ownerCredentialForm } from './owner-manager.js';
const branch = randomUUID(),
  assignment = randomUUID(),
  userId = randomUUID();
const summary = {
  id: assignment,
  userId,
  branchId: branch,
  fullName: 'Pending Manager',
  status: 'pending_activation',
};
const response = {
  id: assignment,
  branchId: branch,
  status: 'pending_activation',
  expiresAt: '2026-10-13T12:00:00.000Z',
  acceptance: 'temporary_password',
};
function wire(value: unknown = response, bearer = false) {
  const requests: Request[] = [],
    state = { value, fail: false };
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: bearer
      ? { kind: 'bearer', accessToken: async () => 'access' }
      : { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      if (state.fail) throw new Error('transport');
      return Response.json(state.value);
    },
  });
  return { client, state, requests, actions: ownerSetupActions(client, randomUUID) };
}
it('AUTH-M SEC: private bounded Manager listing retains branch, cursor and strict projection', async () => {
  const w = wire({ data: [summary], nextCursor: null });
  expect(await listOwnerManagers(w.client, branch, { limit: 20, cursor: assignment })).toEqual({
    data: [summary],
    nextCursor: null,
  });
  expect(w.requests[0]?.url).toBe(
    'https://api.example.test/v1/manage/branches/' +
      branch +
      '/managers?limit=20&cursor=' +
      assignment,
  );
  w.state.value = { data: [], nextCursor: null };
  expect((await listOwnerManagers(w.client, branch, { limit: 20 })).data).toEqual([]);
});
it('SEC: invalid listing identifiers and limits fail before transport', async () => {
  const w = wire();
  await expect(listOwnerManagers(w.client, 'bad', { limit: 20 })).rejects.toThrow();
  await expect(listOwnerManagers(w.client, branch, { limit: 101 })).rejects.toThrow();
  expect(w.requests).toHaveLength(0);
});
it('SEC: a foreign branch or credential-bearing Manager projection cannot populate recovery choices', async () => {
  for (const row of [
    { ...summary, branchId: randomUUID() },
    { ...summary, passwordHash: 'private' },
  ])
    await expect(
      listOwnerManagers(wire({ data: [row], nextCursor: null }).client, branch, { limit: 20 }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([false, true])(
  'AUTH-M: %s replacement mode produces only the strict credential body',
  (manual) => {
    expect(
      ownerCredentialForm({ temporaryPassword: 'ManualPassword!778', userId }, manual),
    ).toEqual({
      temporaryCredential: manual
        ? { mode: 'manual', password: 'ManualPassword!778' }
        : { mode: 'auto' },
    });
  },
);
it('SEC: short or missing manual replacement secrets are rejected', () => {
  expect(() => ownerCredentialForm({}, true)).toThrow();
  expect(() => ownerCredentialForm({ temporaryPassword: 'short' }, true)).toThrow();
});
it.each([false, true])(
  'AUTH-M SEC: %s replacement preserves scope, idempotency and protected transport',
  async (bearer) => {
    const w = wire(response, bearer),
      body = ownerCredentialForm({}, false);
    expect(await w.actions.resetInvitation(branch, assignment, body)).toEqual(response);
    expect(w.requests[0]?.url).toBe(
      'https://api.example.test/v1/manage/branches/' +
        branch +
        '/managers/' +
        assignment +
        '/reset-temp-password',
    );
    expect(w.requests[0]?.headers.get('authorization')).toBe(bearer ? 'Bearer access' : null);
    expect(w.requests[0]?.headers.get('x-csrf-token')).toBe(bearer ? null : 'csrf');
    expect(w.requests[0]?.headers.get('Idempotency-Key')).toBeTruthy();
    expect(await w.requests[0]?.json()).toEqual(body);
    await w.actions.resetInvitation(branch, assignment, body);
    expect(w.requests[0]?.headers.get('Idempotency-Key')).not.toBe(
      w.requests[1]?.headers.get('Idempotency-Key'),
    );
  },
);
it.each(['branch', 'assignment'] as const)(
  'SEC: mismatched replacement %s response fails closed',
  async (kind) => {
    const w = wire({
      ...response,
      ...(kind === 'branch' ? { branchId: randomUUID() } : { id: randomUUID() }),
    });
    await expect(
      w.actions.resetInvitation(branch, assignment, ownerCredentialForm({}, false)),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('AUTH-M: uncertain identical replacement retries retain the key, changed input uses another key', async () => {
  const w = wire();
  w.state.fail = true;
  const body = ownerCredentialForm({ temporaryPassword: 'ManualPassword!778' }, true);
  await expect(w.actions.resetInvitation(branch, assignment, body)).rejects.toThrow();
  await expect(w.actions.resetInvitation(branch, assignment, body)).rejects.toThrow();
  expect(w.requests[0]?.headers.get('Idempotency-Key')).toBe(
    w.requests[1]?.headers.get('Idempotency-Key'),
  );
  await expect(
    w.actions.resetInvitation(branch, assignment, ownerCredentialForm({}, false)),
  ).rejects.toThrow();
  expect(w.requests[2]?.headers.get('Idempotency-Key')).not.toBe(
    w.requests[1]?.headers.get('Idempotency-Key'),
  );
});
it('SEC: closing recovery discards only that branch credential intent', async () => {
  const w = wire(),
    other = randomUUID(),
    body = ownerCredentialForm({ temporaryPassword: 'ManualPassword!778' }, true);
  w.state.fail = true;
  await expect(w.actions.resetInvitation(branch, assignment, body)).rejects.toThrow();
  await expect(w.actions.resetInvitation(other, assignment, body)).rejects.toThrow();
  w.actions.forgetInvitationReset(branch);
  await expect(w.actions.resetInvitation(branch, assignment, body)).rejects.toThrow();
  await expect(w.actions.resetInvitation(other, assignment, body)).rejects.toThrow();
  expect(w.requests[0]?.headers.get('Idempotency-Key')).not.toBe(
    w.requests[2]?.headers.get('Idempotency-Key'),
  );
  expect(w.requests[1]?.headers.get('Idempotency-Key')).toBe(
    w.requests[3]?.headers.get('Idempotency-Key'),
  );
});
it('SEC: invalid replacement paths and spoofed input never dispatch', async () => {
  const w = wire();
  await expect(
    w.actions.resetInvitation('bad', assignment, ownerCredentialForm({}, false)),
  ).rejects.toThrow();
  await expect(
    w.actions.resetInvitation(branch, 'bad', ownerCredentialForm({}, false)),
  ).rejects.toThrow();
  await expect(
    w.actions.resetInvitation(branch, assignment, {
      temporaryCredential: { mode: 'auto' },
      userId,
    }),
  ).rejects.toThrow();
  expect(w.requests).toHaveLength(0);
});
it('AUTH-M-006: cancelling a pending invitation posts to that exact assignment', async () => {
  const w = wire({ id: assignment, branchId: branch, status: 'deactivated' }, true);
  await expect(
    removeOwnerManager(w.client, branch, assignment, 'Owner password 1'),
  ).resolves.toMatchObject({
    status: 'deactivated',
  });
  const request = w.requests.at(-1);
  expect(request?.method).toBe('POST');
  expect(new URL(request?.url ?? '').pathname).toBe(
    '/v1/manage/branches/' + branch + '/managers/' + assignment + '/deactivate',
  );
  expect(await request?.clone().json()).toEqual({ currentPassword: 'Owner password 1' });
});
it.each([
  { id: randomUUID(), branchId: branch, status: 'deactivated' },
  { id: assignment, branchId: randomUUID(), status: 'deactivated' },
  { id: assignment, branchId: branch, status: 'pending_activation' },
])(
  'AUTH-M-006 SEC: a cancel answer for another assignment or state is rejected %#',
  async (value) => {
    const w = wire(value, true);
    await expect(
      removeOwnerManager(w.client, branch, assignment, 'Owner password 1'),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  },
);
