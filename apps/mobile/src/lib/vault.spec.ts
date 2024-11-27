import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { CredentialVault, mobileSessionSchema, type CredentialStorage } from './vault';
export const credentials = {
  client: 'mobile' as const,
  expiresIn: 600 as const,
  sessionId: randomUUID(),
  accessToken: 'a'.repeat(64),
  refreshToken: 'r'.repeat(64),
};
export function storageFixture(initial: string | null = null) {
  let saved = initial;
  const storage: CredentialStorage = {
    read: vi.fn(async () => saved),
    write: vi.fn(async (value) => {
      saved = value;
    }),
    remove: vi.fn(async () => {
      saved = null;
    }),
  };
  return { storage, vault: new CredentialVault(storage), saved: () => saved };
}
it('SEC-001: only a strict credential envelope is persisted and restored atomically', async () => {
  const { vault, saved, storage } = storageFixture();
  expect(await vault.read()).toBeUndefined();
  await vault.save(credentials);
  expect(JSON.parse(saved() ?? '')).toEqual({ version: 1, session: credentials });
  expect(await vault.read()).toEqual(credentials);
  expect(storage.write).toHaveBeenCalledTimes(1);
  await vault.clear();
  expect(await vault.read()).toBeUndefined();
});
it.each([
  'broken-json',
  '{}',
  JSON.stringify({ version: 2, session: credentials }),
  JSON.stringify({ version: 1, session: { ...credentials, phone: '+921234567890' } }),
])('SEC-001: discards corrupt or excessive credential envelopes', async (initial) => {
  const { vault, storage } = storageFixture(initial);
  expect(await vault.read()).toBeUndefined();
  expect(storage.remove).toHaveBeenCalledOnce();
});
it('SEC-001: rejects invalid save before accessing storage', async () => {
  const { vault, storage } = storageFixture();
  await expect(vault.save({ ...credentials, accessToken: '' })).rejects.toThrow(
    'Invalid secure session',
  );
  expect(storage.write).not.toHaveBeenCalled();
  expect(mobileSessionSchema.safeParse({ ...credentials, client: 'web' }).success).toBe(false);
});
it('SEC-001: read outage yields only a safe error', async () => {
  const { vault, storage } = storageFixture();
  vi.mocked(storage.read).mockRejectedValue(new Error('private storage data'));
  await expect(vault.read()).rejects.toThrow('Secure session storage unavailable');
});
it('SEC-001: failed secure write removes stale credentials and never succeeds', async () => {
  const { vault, storage, saved } = storageFixture(
    JSON.stringify({ version: 1, session: credentials }),
  );
  vi.mocked(storage.write).mockRejectedValue(new Error('private storage data'));
  await expect(vault.save(credentials)).rejects.toThrow('Secure session storage unavailable');
  expect(saved()).toBeNull();
});
it('SEC-001: failed deletion cannot be reported as secure storage success', async () => {
  const { vault, storage } = storageFixture();
  vi.mocked(storage.remove).mockRejectedValue(new Error('private'));
  await expect(vault.clear()).rejects.toThrow('Secure session storage unavailable');
});
