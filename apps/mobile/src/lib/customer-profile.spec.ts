import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createApiClient } from '@hsm/api-client';
import { completeCustomerProfile } from './customer-profile';
const profile = {
  user: {
    id: randomUUID(),
    fullName: 'Customer identity',
    email: 'identity@example.test',
    emailVerified: true,
    cnicLast4: null,
  },
  capabilities: { customer: true, owner: true, managerOf: [], admin: null },
};
const input = {
  fullName: ' Customer identity ',
  phone: '03001234567',
  age: '22',
  gender: 'female',
  institution: '',
};
function fixture(response: unknown = profile) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'bearer', accessToken: async () => 'credential' },
    fetch: async (value, init) => {
      requests.push(value instanceof Request ? value : new Request(value, init));
      return Response.json(response);
    },
  });
  const refetch = vi.fn(async () => profile);
  return { client, requests, refetch };
}
it('AUTH-C CHG-006: profile completion uses the existing session, canonical phone and age without initial CNIC or birth date', async () => {
  const wire = fixture();
  expect(await completeCustomerProfile(wire, input)).toEqual(profile);
  expect(wire.requests[0]?.method).toBe('PUT');
  expect(wire.requests[0]?.url).toBe('https://api.example.test/v1/me/customer-profile');
  expect(wire.requests[0]?.headers.get('authorization')).toBe('Bearer credential');
  expect(await wire.requests[0]?.clone().json()).toEqual({
    fullName: 'Customer identity',
    phone: '+923001234567',
    age: 22,
    gender: 'female',
  });
  expect(wire.refetch).toHaveBeenCalledOnce();
});
it('AUTH-C: optional institution is trimmed and additive Owner capability survives the fresh response', async () => {
  const wire = fixture();
  expect(
    (await completeCustomerProfile(wire, { ...input, institution: ' Institute ' })).capabilities
      .owner,
  ).toBe(true);
  expect(await wire.requests[0]?.clone().json()).toMatchObject({ institution: 'Institute' });
});
it.each([
  { age: '17' },
  { age: '121' },
  { age: '18.5' },
  { age: '' },
  { phone: 'invalid' },
  { gender: 'other' },
  { fullName: 'a' },
  { cnic: '3520212345678' },
  { dateOfBirth: '2000-01-01' },
])('AUTH-C SEC: invalid or legacy initial profile input cannot reach the API', async (change) => {
  const wire = fixture();
  await expect(completeCustomerProfile(wire, { ...input, ...change })).rejects.toThrow();
  expect(wire.requests).toHaveLength(0);
  expect(wire.refetch).not.toHaveBeenCalled();
});
it('SEC: malformed save response cannot create an optimistic capability', async () => {
  const wire = fixture({ capabilities: { customer: true } });
  await expect(completeCustomerProfile(wire, input)).rejects.toThrow();
  expect(wire.refetch).not.toHaveBeenCalled();
});
it.each([
  undefined,
  { ...profile, capabilities: { ...profile.capabilities, customer: false } },
  { ...profile, user: { ...profile.user, id: randomUUID() } },
])(
  'SEC: missing, revoked or mismatched fresh identity cannot enter the completed experience',
  async (fresh) => {
    const wire = fixture();
    await expect(
      completeCustomerProfile({ client: wire.client, refetch: async () => fresh }, input),
    ).rejects.toThrow('Profile confirmation unavailable');
  },
);

it('AUTH-C: optional native avatar submits only a validated private file reference', async () => {
  const wire = fixture(),
    photo = randomUUID();
  await completeCustomerProfile(wire, { ...input, profilePhotoFileId: photo });
  expect(await wire.requests[0]?.json()).toMatchObject({ profilePhotoFileId: photo });
  const invalid = fixture();
  await expect(
    completeCustomerProfile(invalid, { ...input, profilePhotoFileId: 'invalid' }),
  ).rejects.toThrow();
  expect(invalid.requests).toHaveLength(0);
});

it('SEC-003 / UI-001: explicit avatar deletion reaches the self-profile API as null', async () => {
  const wire = fixture();
  await completeCustomerProfile(wire, { ...input, profilePhotoFileId: null });
  expect(await wire.requests[0]?.clone().json()).toMatchObject({ profilePhotoFileId: null });
});
