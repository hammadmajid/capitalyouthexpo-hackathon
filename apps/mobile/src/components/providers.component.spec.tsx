/// <reference types="jest" />
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ApiFailure, ClientFailure } from '@hsm/api-client';
import { CredentialVault } from '../lib/vault';
import { sessions } from '../lib/runtime';
import { Providers, useSession } from './providers';
jest.mock('../lib/runtime', () => ({
  sessions: { restore: jest.fn(), establish: jest.fn(), logout: jest.fn() },
}));
const profile = {
  user: { id: 'identity', fullName: 'Identity', email: null, emailVerified: true, cnicLast4: null },
  capabilities: { customer: true, owner: false, managerOf: [], admin: null },
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(sessions.restore).mockReset();
  jest.mocked(sessions.establish).mockReset();
  jest.mocked(sessions.logout).mockReset();
  jest.mocked(sessions.restore).mockResolvedValue(profile);
});
async function live() {
  const hook = await renderHook(() => ({ session: useSession(), cache: useQueryClient() }), {
    wrapper: Providers,
  });
  await waitFor(() => expect(hook.result.current.session.profile).toEqual(profile));
  return hook;
}
test('SEC-001: failed server logout preserves a truthful global notice after local sign-out', async () => {
  const hook = await live();
  jest.mocked(sessions.logout).mockRejectedValue(new Error('Unavailable'));
  await act(async () => {
    await expect(hook.result.current.session.logout(true)).rejects.toThrow();
  });
  expect(hook.result.current.session.profile).toBeUndefined();
  expect(
    'logoutNotice' in hook.result.current.session &&
      typeof hook.result.current.session.logoutNotice === 'string',
  ).toBe(true);
});
test('SEC-001: failed secure deletion blocks restoration until cleanup is retried', async () => {
  const vault = new CredentialVault({
    read: async () => null,
    write: async () => undefined,
    remove: async () => {
      throw new Error('Unavailable');
    },
  });
  const hook = await live();
  jest.mocked(sessions.logout).mockImplementation(() => vault.clear());
  await act(async () => {
    await expect(hook.result.current.session.logout()).rejects.toThrow();
  });
  expect(hook.result.current.session.profile).toBeUndefined();
  expect(
    'cleanupError' in hook.result.current.session &&
      Boolean(hook.result.current.session.cleanupError),
  ).toBe(true);
});
test('SEC-001: terminal session rejection immediately removes all private query data', async () => {
  const hook = await live();
  hook.result.current.cache.setQueryData(['private'], 'Private fixture data');
  jest.mocked(sessions.restore).mockRejectedValue(
    new ApiFailure({
      type: 'https://example.com/problem',
      title: 'Rejected',
      status: 401,
      code: 'SESSION_REVOKED',
      detail: 'Unavailable',
      traceId: 'fixture',
    }),
  );
  await act(async () => {
    await hook.result.current.session.refetch();
  });
  expect(hook.result.current.session.profile).toBeUndefined();
  expect(hook.result.current.cache.getQueryData(['private'])).toBeUndefined();
});

test('SEC-001: successful logout clears identity and private queries', async () => {
  const hook = await live();
  hook.result.current.cache.setQueryData(['private'], 'Private fixture data');
  jest.mocked(sessions.logout).mockResolvedValue(undefined);
  await act(async () => {
    await hook.result.current.session.logout();
  });
  expect(hook.result.current.session.profile).toBeUndefined();
  expect(hook.result.current.cache.getQueryData(['private'])).toBeUndefined();
  expect(hook.result.current.session.logoutNotice).toBeUndefined();
});

test('SEC-001: a late restore response cannot resurrect a logged-out identity', async () => {
  const hook = await live();
  let complete: ((value: typeof profile) => void) | undefined;
  const delayed = new Promise<typeof profile>((resolve) => {
    complete = resolve;
  });
  jest.mocked(sessions.restore).mockReturnValue(delayed);
  jest.mocked(sessions.logout).mockResolvedValue(undefined);
  await act(async () => {
    const pending = hook.result.current.session.refetch();
    await hook.result.current.session.logout();
    complete?.(profile);
    await pending;
  });
  expect(hook.result.current.session.profile).toBeUndefined();
});

test('SEC-001: secure cleanup retry preserves all-device revocation and unblocks after success', async () => {
  const vault = new CredentialVault({
    read: async () => null,
    write: async () => undefined,
    remove: async () => {
      throw new Error('Unavailable');
    },
  });
  const hook = await live();
  jest
    .mocked(sessions.logout)
    .mockImplementationOnce(() => vault.clear())
    .mockResolvedValue(undefined);
  await act(async () => {
    await expect(hook.result.current.session.logout(true)).rejects.toThrow();
  });
  await act(async () => {
    await hook.result.current.session.refetch();
  });
  expect(sessions.restore).toHaveBeenCalledTimes(1);
  await act(async () => {
    await hook.result.current.session.retryCleanup();
  });
  expect(sessions.logout).toHaveBeenNthCalledWith(2, true);
  expect(hook.result.current.session.cleanupError).toBeUndefined();
  expect(hook.result.current.session.profile).toBeUndefined();
});

test('ADM-001 SEC-003: role loss clears Admin queries while preserving the same Customer session', async () => {
  const hook = await live();
  const admin = {
    ...profile,
    capabilities: { ...profile.capabilities, admin: { isRoot: true, roles: [] } },
  };
  jest.mocked(sessions.restore).mockResolvedValue(admin);
  await act(async () => {
    await hook.result.current.session.refetch();
  });
  hook.result.current.cache.setQueryDefaults(['platform-admin'], { gcTime: Infinity });
  hook.result.current.cache.setQueryDefaults(['customer'], { gcTime: Infinity });
  hook.result.current.cache.setQueryData(['platform-admin', profile.user.id], 'staff fixture');
  hook.result.current.cache.setQueryData(['customer', profile.user.id], 'customer fixture');
  jest.mocked(sessions.restore).mockResolvedValue(profile);
  await act(async () => {
    await hook.result.current.session.refetch();
  });
  expect(
    hook.result.current.cache.getQueryData(['platform-admin', profile.user.id]),
  ).toBeUndefined();
  expect(hook.result.current.cache.getQueryData(['customer', profile.user.id])).toBe(
    'customer fixture',
  );
  expect(hook.result.current.session.profile?.capabilities.customer).toBe(true);
});
test('SEC-003: successful identity change clears private datasets of both contexts', async () => {
  const hook = await live();
  hook.result.current.cache.setQueryData(['platform-admin', profile.user.id], 'staff fixture');
  hook.result.current.cache.setQueryData(['customer', profile.user.id], 'customer fixture');
  jest
    .mocked(sessions.restore)
    .mockResolvedValue({ ...profile, user: { ...profile.user, id: 'other' } });
  await act(async () => {
    await hook.result.current.session.refetch();
  });
  expect(
    hook.result.current.cache.getQueryData(['platform-admin', profile.user.id]),
  ).toBeUndefined();
  expect(hook.result.current.cache.getQueryData(['customer', profile.user.id])).toBeUndefined();
});

test('SEC-001: a brief network drop during a background check keeps the signed-in app', async () => {
  const hook = await live();
  hook.result.current.cache.setQueryData(['private'], 'Form data still needed');
  jest.mocked(sessions.restore).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await hook.result.current.session.refetch();
  });
  expect(hook.result.current.session.profile).toEqual(profile);
  expect(hook.result.current.cache.getQueryData(['private'])).toBe('Form data still needed');
});
