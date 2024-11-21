import { randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthCrypto } from './crypto.js';
import { OwnerProfileService } from './owner-profile.service.js';
import type { OwnerIdentity, OwnerProfileTransaction } from './owner-profile.store.js';
import type { ProfileAttachment } from './customer-profile.store.js';
const crypto = new AuthCrypto({
  JWT_SECRET: randomBytes(48).toString('hex'),
  CNIC_HASH_KEY: randomBytes(32).toString('hex'),
  CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
});
const now = new Date('2026-10-10T12:00:00Z');
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const input = {
  fullName: 'Owner Identity',
  phone: '03001234567',
  cnic: '35202-1234567-1',
  cnicFrontFileId: randomUUID(),
  cnicBackFileId: randomUUID(),
  address: 'Verified owner address',
  agreementAccepted: true,
  agreementVersion: 'owner-foundation-v1',
};
let identity: OwnerIdentity | undefined;
const attachments = new Map<string, ProfileAttachment>();
const file = vi.fn(async (id: string) => attachments.get(id));
const save = vi.fn().mockResolvedValue(undefined);
const transaction = vi.fn();
const store = {
  transaction: async <T>(
    _actor: typeof actor,
    work: (value: OwnerProfileTransaction) => Promise<T>,
  ) => {
    transaction(_actor, work);
    return work({ identity, file, save });
  },
};
const projection = {
  user: { id: actor.userId, cnicLast4: '5671' },
  capabilities: { customer: true, owner: true, managerOf: [], admin: null },
};
const profiles = { read: vi.fn().mockResolvedValue(projection) };
const service = new OwnerProfileService(store, crypto, profiles, () => now);
beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
  attachments.clear();
  identity = {
    id: actor.userId,
    fullName: '',
    email: 'owner@example.test',
    emailVerifiedAt: now,
    passwordHash: 'protected-permanent-hash',
    accountStatus: 'active',
    cnicHash: null,
    phoneE164: null,
  };
  for (const id of [input.cnicFrontFileId, input.cnicBackFileId])
    attachments.set(id, { id, purpose: 'verification_document', scanStatus: 'clean' });
});
it('OWN-001 CHG-006 SEC: Owner completion protects CNIC before persistence and retains simultaneous Customer capability', async () => {
  expect(await service.complete(actor, input)).toEqual(projection);
  const persisted = save.mock.calls[0]?.[0];
  const protectedCnic = save.mock.calls[0]?.[1];
  expect(persisted).toMatchObject({
    fullName: input.fullName,
    phone: '+923001234567',
    agreementVersion: input.agreementVersion,
  });
  expect(persisted).not.toHaveProperty('cnic');
  expect(protectedCnic.cnicLast4).toBe('5671');
  expect(protectedCnic.cnicHash).toEqual(crypto.protectCnic(input.cnic).cnicHash);
  expect(crypto.decrypt(protectedCnic.cnicEncrypted, 'cnic')).toBe('3520212345671');
  expect(protectedCnic.cnicEncrypted.toString()).not.toContain('3520212345671');
  expect(file).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledWith(persisted, protectedCnic, now);
  expect(save.mock.invocationCallOrder[0]).toBeLessThan(
    profiles.read.mock.invocationCallOrder[0] ?? 0,
  );
});
it('OWN-001: an existing protected CNIC can be retained while a clean private avatar is added', async () => {
  if (!identity) throw new Error('Missing Owner unit identity');
  identity.fullName = input.fullName;
  identity.cnicHash = crypto.protectCnic(input.cnic).cnicHash;
  const photo = randomUUID();
  attachments.set(photo, { id: photo, purpose: 'avatar', scanStatus: 'clean' });
  await service.complete(actor, {
    ...input,
    organizationName: 'Owner organization',
    profilePhotoFileId: photo,
  });
  expect(file).toHaveBeenCalledWith(photo);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ organizationName: 'Owner organization', profilePhotoFileId: photo }),
    expect.anything(),
    now,
  );
});
it('SEC: Owner signup proof cannot silently replace an existing CNIC', async () => {
  if (!identity) throw new Error('Missing Owner unit identity');
  identity.cnicHash = crypto.protectCnic('3520212345672').cnicHash;
  await expect(service.complete(actor, input)).rejects.toMatchObject({
    code: 'CONFLICT',
    status: 409,
  });
  expect(file).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
it.each([
  ['missing identity', undefined, 'UNAUTHENTICATED'],
  ['missing email', { email: null }, 'EMAIL_NOT_VERIFIED'],
  ['unverified email', { emailVerifiedAt: null }, 'EMAIL_NOT_VERIFIED'],
  ['passwordless identity', { passwordHash: null }, 'INVALID_CREDENTIALS'],
  ['suspended identity', { accountStatus: 'suspended' }, 'ACCOUNT_SUSPENDED'],
  ['changed historical name', { fullName: 'Different Identity' }, 'CONFLICT'],
] as const)('OWN-001 SEC: %s cannot gain Owner capability', async (_name, patch, code) => {
  identity = patch === undefined ? undefined : { ...(identity as OwnerIdentity), ...patch };
  await expect(service.complete(actor, input)).rejects.toMatchObject({ code });
  expect(save).not.toHaveBeenCalled();
  expect(profiles.read).not.toHaveBeenCalled();
});
it.each(['front', 'back', 'photo'] as const)(
  'SEC: %s document must have the correct clean private-file purpose',
  async (side) => {
    const id =
      side === 'front'
        ? input.cnicFrontFileId
        : side === 'back'
          ? input.cnicBackFileId
          : randomUUID();
    const body = { ...input, ...(side === 'photo' ? { profilePhotoFileId: id } : {}) };
    attachments.delete(id);
    await expect(service.complete(actor, body)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    attachments.set(id, {
      id,
      purpose: side === 'photo' ? 'verification_document' : 'avatar',
      scanStatus: 'clean',
    });
    await expect(service.complete(actor, body)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    for (const scanStatus of ['pending', 'rejected'] as const) {
      attachments.set(id, {
        id,
        purpose: side === 'photo' ? 'avatar' : 'verification_document',
        scanStatus,
      });
      await expect(service.complete(actor, body)).rejects.toMatchObject({ code: 'CONFLICT' });
    }
    expect(save).not.toHaveBeenCalled();
  },
);
it.each([
  { agreementAccepted: false },
  { agreementVersion: 'unapproved-version' },
  { cnicBackFileId: input.cnicFrontFileId },
  { phone: 'invalid' },
  { bankAccount: 'untrusted' },
  { userId: randomUUID() },
  { emailVerifiedAt: now },
] as const)(
  'OWN-001 SEC: invalid agreement, documents or privileged input rejects before persistence',
  async (patch) => {
    await expect(service.complete(actor, { ...input, ...patch })).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  },
);
it('SEC: failed Owner persistence never publishes a new capability projection', async () => {
  save.mockRejectedValueOnce(new Error('Owner persistence unavailable'));
  await expect(service.complete(actor, input)).rejects.toThrow('Owner persistence unavailable');
  expect(profiles.read).not.toHaveBeenCalled();
});

it.each(['both', 'front', 'back'] as const)(
  'OWN-001: %s CNIC photos may be omitted; supplied evidence still gets checked',
  async (missing) => {
    const value = {
      ...input,
      ...(missing !== 'back' ? { cnicFrontFileId: undefined } : {}),
      ...(missing !== 'front' ? { cnicBackFileId: undefined } : {}),
    };
    await service.complete(actor, value);
    expect(file).toHaveBeenCalledTimes(missing === 'both' ? 0 : 1);
    expect(save).toHaveBeenCalledTimes(1);
  },
);

it('SEC-003 / UI-001: explicit avatar removal keeps verified self-profile checks and skips new-file lookup', async () => {
  await service.complete(actor, {
    ...input,
    cnicFrontFileId: undefined,
    cnicBackFileId: undefined,
    profilePhotoFileId: null,
  });
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ profilePhotoFileId: null }),
    expect.anything(),
    now,
  );
  expect(file).not.toHaveBeenCalled();
});
