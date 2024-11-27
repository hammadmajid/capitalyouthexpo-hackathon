import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from '@hsm/api-client';
import { CredentialVault, type CredentialStorage } from './vault';
import { MobileSessionManager, mobileLoginSchema } from './session';
const profile = {
  user: {
    id: randomUUID(),
    fullName: 'Identity',
    email: null,
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
const session = {
  client: 'mobile' as const,
  expiresIn: 600 as const,
  sessionId: randomUUID(),
  accessToken: 'a'.repeat(64),
  refreshToken: 'r'.repeat(64),
};
function failure(code: string, status = 401) {
  return {
    type: 'https://example.com/problem',
    title: 'Failed',
    status,
    code,
    detail: 'Unavailable',
    traceId: 'trace',
  };
}
function fixture(responses: { body: unknown; status?: number }[], initial = true) {
  let saved: string | null = initial ? JSON.stringify({ version: 1, session }) : null;
  const requests: Request[] = [];
  const storage: CredentialStorage = {
    read: vi.fn(async () => saved),
    write: vi.fn(async (value) => {
      saved = value;
    }),
    remove: vi.fn(async () => {
      saved = null;
    }),
  };
  const vault = new CredentialVault(storage);
  const transport: typeof fetch = async (input, init) => {
    requests.push(input instanceof Request ? input : new Request(input, init));
    const next = responses.shift();
    if (!next) throw new Error('Network unavailable');
    return Response.json(next.body, { status: next.status ?? 200 });
  };
  const client = createApiClient({
    baseUrl: 'https://api.example.com',
    fetch: transport,
    authentication: { kind: 'bearer', accessToken: async () => (await vault.read())?.accessToken },
  });
  return { vault, storage, requests, manager: new MobileSessionManager(client, vault) };
}
it('AUTH-C: missing secure credentials make no network request', async () => {
  const wire = fixture([], false);
  expect(await wire.manager.restore()).toBeUndefined();
  expect(wire.requests).toHaveLength(0);
});
it('AUTH-C: restoration uses live backend capabilities and never cookies', async () => {
  const wire = fixture([{ body: profile }]);
  expect(await wire.manager.restore()).toEqual(profile);
  expect(wire.requests[0]?.headers.get('authorization')).toBe('Bearer ' + session.accessToken);
  expect(wire.requests[0]?.credentials).toBe('omit');
});
it.each(['UNAUTHENTICATED', 'TOKEN_EXPIRED'])(
  'SEC-001: %s rotates once, atomically persists and verifies live grants',
  async (code) => {
    const next = {
      ...session,
      sessionId: randomUUID(),
      accessToken: 'b'.repeat(64),
      refreshToken: 's'.repeat(64),
    };
    const wire = fixture([{ body: failure(code), status: 401 }, { body: next }, { body: profile }]);
    const [first, second] = await Promise.all([wire.manager.restore(), wire.manager.restore()]);
    expect(first).toEqual(profile);
    expect(second).toEqual(profile);
    expect(wire.requests).toHaveLength(3);
    expect(await wire.requests[1]?.clone().json()).toEqual({ refreshToken: session.refreshToken });
    expect(wire.requests[1]?.headers.has('authorization')).toBe(false);
    expect(wire.requests[2]?.headers.get('authorization')).toBe('Bearer ' + next.accessToken);
    expect(await wire.vault.read()).toEqual(next);
  },
);
it.each(['SESSION_REVOKED', 'FORBIDDEN', 'ACCOUNT_SUSPENDED'])(
  'SEC-001: immediate %s rejection clears credentials without refreshing',
  async (code) => {
    const wire = fixture([
      {
        body: failure(code, code === 'FORBIDDEN' ? 403 : 401),
        status: code === 'FORBIDDEN' ? 403 : 401,
      },
    ]);
    await expect(wire.manager.restore()).rejects.toThrow();
    expect(await wire.vault.read()).toBeUndefined();
    expect(wire.requests).toHaveLength(1);
  },
);
it('SEC-001: nonterminal service rejection preserves valid credentials but grants no access', async () => {
  const wire = fixture([{ body: failure('RATE_LIMITED', 429), status: 429 }]);
  await expect(wire.manager.restore()).rejects.toThrow();
  expect(await wire.vault.read()).toEqual(session);
});
it.each(['SESSION_REVOKED', 'UNAUTHENTICATED', 'TOKEN_EXPIRED', 'FORBIDDEN', 'ACCOUNT_SUSPENDED'])(
  'SEC-001: terminal refresh %s clears the entire envelope',
  async (code) => {
    const status = code === 'FORBIDDEN' ? 403 : 401;
    const wire = fixture([
      { body: failure('TOKEN_EXPIRED'), status: 401 },
      { body: failure(code, status), status },
    ]);
    await expect(wire.manager.restore()).rejects.toThrow();
    expect(await wire.vault.read()).toBeUndefined();
  },
);
it('SEC-001: malformed refresh responses clear unusable lineage instead of replaying old refresh', async () => {
  const wire = fixture([{ body: failure('TOKEN_EXPIRED'), status: 401 }, { body: {} }]);
  await expect(wire.manager.restore()).rejects.toThrow();
  expect(await wire.vault.read()).toBeUndefined();
});
it('SEC-001: network outage remains an error and does not erase the stored session', async () => {
  const wire = fixture([]);
  await expect(wire.manager.restore()).rejects.toThrow();
  expect(await wire.vault.read()).toEqual(session);
});
it('SEC-001: refresh network outage keeps credentials without falsely granting a profile', async () => {
  const wire = fixture([{ body: failure('TOKEN_EXPIRED'), status: 401 }]);
  await expect(wire.manager.restore()).rejects.toThrow();
  expect(await wire.vault.read()).toEqual(session);
});
it('AUTH-C: establishment saves credentials then retrieves live profile', async () => {
  const wire = fixture([{ body: profile }], false);
  expect(await wire.manager.establish(async () => session)).toEqual(profile);
  expect(await wire.vault.read()).toEqual(session);
  expect(mobileLoginSchema.safeParse({ ...session, ...profile }).success).toBe(true);
  expect(mobileLoginSchema.safeParse({ ...session, ...profile, phone: 'private' }).success).toBe(
    false,
  );
});
it('SEC-001: denied profile after establishment clears the new session', async () => {
  const wire = fixture([{ body: failure('SESSION_REVOKED'), status: 401 }], false);
  await expect(wire.manager.establish(async () => session)).rejects.toThrow();
  expect(await wire.vault.read()).toBeUndefined();
});
it('SEC-001: network failure after establishment preserves credentials for a later verified restore', async () => {
  const wire = fixture([], false);
  await expect(wire.manager.establish(async () => session)).rejects.toThrow();
  expect(await wire.vault.read()).toEqual(session);
});
it.each([false, true])(
  'SEC-001: logout all=%s revokes server session and deletes secure credentials',
  async (all) => {
    const wire = fixture([{ body: profile }, { body: { revoked: true } }]);
    await wire.manager.logout(all);
    expect(await wire.vault.read()).toBeUndefined();
    expect(wire.requests[1]?.url).toBe(
      'https://api.example.com/v1/auth/' + (all ? 'logout-all' : 'logout'),
    );
  },
);
it('SEC-001: logout with no credentials performs no unauthenticated mutation', async () => {
  const wire = fixture([], false);
  await wire.manager.logout();
  expect(wire.requests).toHaveLength(0);
});
it('SEC-001: logout outage deletes local credentials without falsely reporting server success', async () => {
  const wire = fixture([{ body: profile }]);
  await expect(wire.manager.logout()).rejects.toThrow();
  expect(await wire.vault.read()).toBeUndefined();
});
it('SEC-001: failed operation does not poison the serialized queue', async () => {
  const wire = fixture([{ body: profile }], false);
  await expect(
    wire.manager.establish(async () => {
      throw new Error('Failed');
    }),
  ).rejects.toThrow();
  expect(await wire.manager.establish(async () => session)).toEqual(profile);
});
