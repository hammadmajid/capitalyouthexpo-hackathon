import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { CustomerProfileService } from './customer-profile.service.js';
import type {
  CustomerIdentity,
  CustomerProfileTransaction,
  ProfileAttachment,
} from './customer-profile.store.js';
const now = new Date('2026-10-10T12:00:00Z');
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const input = { fullName: 'Customer Identity', phone: '03001234567', age: 21, gender: 'female' };
let identity: CustomerIdentity | undefined;
let attachment: ProfileAttachment | undefined;
const save = vi.fn().mockResolvedValue(undefined);
const file = vi.fn(async () => attachment);
const transaction = vi.fn();
const store = {
  transaction: async <T>(
    _actor: typeof actor,
    work: (value: CustomerProfileTransaction) => Promise<T>,
  ) => {
    transaction(_actor, work);
    return work({ identity, file, save });
  },
};
const projection = {
  user: { id: actor.userId },
  capabilities: { customer: true, owner: true, managerOf: [], admin: null },
};
const profiles = { read: vi.fn().mockResolvedValue(projection) };
const service = new CustomerProfileService(store, profiles, () => now);
beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
  identity = {
    id: actor.userId,
    fullName: '',
    email: 'customer@example.test',
    emailVerifiedAt: now,
    passwordHash: 'protected-permanent-hash',
    accountStatus: 'active',
    gender: null,
  };
  attachment = { id: randomUUID(), purpose: 'avatar', scanStatus: 'clean' };
});
it('AUTH-C-001/003 CHG-006: initial Customer profile accepts canonical phone and age without DOB or CNIC', async () => {
  expect(await service.complete(actor, input)).toEqual(projection);
  expect(transaction).toHaveBeenCalledWith(actor, expect.any(Function));
  expect(save).toHaveBeenCalledWith({ ...input, phone: '+923001234567' }, now);
  expect(file).not.toHaveBeenCalled();
  expect(profiles.read).toHaveBeenCalledWith(actor.userId);
  expect(save.mock.invocationCallOrder[0]).toBeLessThan(
    profiles.read.mock.invocationCallOrder[0] ?? 0,
  );
});
it('AUTH-C CHG-006: age remains editable while existing identity and simultaneous Owner capability are retained', async () => {
  if (!identity) throw new Error('Missing unit identity');
  identity.fullName = input.fullName;
  identity.gender = 'female';
  const body = {
    ...input,
    age: 35,
    institution: '  Example University  ',
    profilePhotoFileId: attachment?.id,
  };
  expect(await service.complete(actor, body)).toEqual(projection);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ age: 35, institution: 'Example University' }),
    now,
  );
  expect(file).toHaveBeenCalledWith(attachment?.id);
});
it.each([
  ['missing identity', undefined, 'UNAUTHENTICATED'],
  ['missing email', { email: null }, 'EMAIL_NOT_VERIFIED'],
  ['unverified email', { emailVerifiedAt: null }, 'EMAIL_NOT_VERIFIED'],
  ['passwordless identity', { passwordHash: null }, 'INVALID_CREDENTIALS'],
  ['suspended identity', { accountStatus: 'suspended' }, 'ACCOUNT_SUSPENDED'],
  ['changed historical name', { fullName: 'Existing Identity' }, 'CONFLICT'],
  ['changed historical gender', { gender: 'male' }, 'CONFLICT'],
] as const)('SEC AUTH-C: %s cannot persist a Customer profile', async (_name, patch, code) => {
  identity = patch === undefined ? undefined : { ...(identity as CustomerIdentity), ...patch };
  await expect(service.complete(actor, input)).rejects.toMatchObject({ code });
  expect(save).not.toHaveBeenCalled();
  expect(profiles.read).not.toHaveBeenCalled();
});
it.each(['dateOfBirth', 'cnic', 'emergencyContact', 'email', 'phoneVerifiedAt', 'owner', 'userId'])(
  'AUTH-C CHG-006 SEC: rejects removed or privileged input %s',
  async (field) => {
    await expect(service.complete(actor, { ...input, [field]: 'untrusted' })).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  },
);
it.each([17, 121, 18.5])('AUTH-C-003: rejects invalid age %s before database work', async (age) => {
  await expect(service.complete(actor, { ...input, age })).rejects.toThrow();
  expect(transaction).not.toHaveBeenCalled();
});
it.each([
  ['foreign or missing', undefined, 'NOT_FOUND'],
  ['wrong purpose', { purpose: 'verification_document' }, 'NOT_FOUND'],
  ['pending scan', { scanStatus: 'pending' }, 'CONFLICT'],
  ['rejected scan', { scanStatus: 'rejected' }, 'CONFLICT'],
] as const)('SEC: %s photo cannot be attached', async (_name, patch, code) => {
  attachment = patch === undefined ? undefined : { ...(attachment as ProfileAttachment), ...patch };
  await expect(
    service.complete(actor, { ...input, profilePhotoFileId: randomUUID() }),
  ).rejects.toMatchObject({ code });
  expect(save).not.toHaveBeenCalled();
});
it('SEC: failed persistence never publishes a capability projection', async () => {
  save.mockRejectedValueOnce(new Error('Transactional persistence failed'));
  await expect(service.complete(actor, input)).rejects.toThrow('Transactional persistence failed');
  expect(profiles.read).not.toHaveBeenCalled();
});

it('SEC-003 / UI-001: explicit avatar removal keeps verified self-profile checks and skips new-file lookup', async () => {
  await service.complete(actor, { ...input, profilePhotoFileId: null });
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ profilePhotoFileId: null }), now);
  expect(file).not.toHaveBeenCalled();
});
