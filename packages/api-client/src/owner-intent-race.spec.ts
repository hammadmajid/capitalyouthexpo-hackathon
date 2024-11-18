import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { ownerSetupActions } from './owner-setup.js';
const branch = randomUUID(),
  assignment = randomUUID();
const response = {
  id: assignment,
  branchId: branch,
  status: 'pending_activation',
  expiresAt: '2026-10-13T12:00:00.000Z',
  acceptance: 'temporary_password',
};
it.each(['invite', 'resetInvitation'] as const)(
  'AUTH-M SEC: a stale %s success cannot erase the reopened flow retry key',
  async (operation) => {
    const requests: Request[] = [];
    let release: (value: Response) => void = () => undefined;
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
      fetch: async (input, init) => {
        requests.push(input instanceof Request ? input : new Request(input, init));
        if (requests.length === 1)
          return new Promise((done) => {
            release = done;
          });
        throw new Error('transport');
      },
    });
    const actions = ownerSetupActions(client, randomUUID),
      body = { temporaryCredential: { mode: 'auto' } };
    const run = () =>
      operation === 'invite'
        ? actions.invite(branch, { ...body, fullName: 'Manager', phone: '03001234567' })
        : actions.resetInvitation(branch, assignment, body);
    const first = run();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    if (operation === 'invite') actions.forgetInvitation(branch);
    else actions.forgetInvitationReset(branch);
    await expect(run()).rejects.toThrow();
    release(Response.json(response));
    await first;
    await expect(run()).rejects.toThrow();
    expect(requests[0]?.headers.get('Idempotency-Key')).not.toBe(
      requests[1]?.headers.get('Idempotency-Key'),
    );
    expect(requests[2]?.headers.get('Idempotency-Key')).toBe(
      requests[1]?.headers.get('Idempotency-Key'),
    );
  },
);
it.each(['invite', 'resetInvitation'] as const)(
  'SEC: closed %s success cannot recreate discarded credential intent',
  async (operation) => {
    const requests: Request[] = [];
    let release: (value: Response) => void = () => undefined;
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'cookie', csrf: () => 'csrf' },
      fetch: async (input, init) => {
        requests.push(input instanceof Request ? input : new Request(input, init));
        if (requests.length === 1)
          return new Promise((done) => {
            release = done;
          });
        return Response.json(response);
      },
    });
    const actions = ownerSetupActions(client, randomUUID),
      body = { temporaryCredential: { mode: 'auto' } };
    const run = () =>
      operation === 'invite'
        ? actions.invite(branch, { ...body, fullName: 'Manager', phone: '03001234567' })
        : actions.resetInvitation(branch, assignment, body);
    const first = run();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    if (operation === 'invite') actions.forgetInvitation(branch);
    else actions.forgetInvitationReset(branch);
    release(Response.json(response));
    await first;
    await run();
    expect(requests[0]?.headers.get('Idempotency-Key')).not.toBe(
      requests[1]?.headers.get('Idempotency-Key'),
    );
  },
);
