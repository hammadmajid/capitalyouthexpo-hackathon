import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
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
function fixture(responses: unknown[] = [profile, profile]) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://web.example.test/api',
    authentication: { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async (value, init) => {
      requests.push(value instanceof Request ? value : new Request(value, init));
      return Response.json(responses.shift());
    },
  });
  return { client, requests };
}
it('AUTH-C CHG-006: web Customer completion uses cookie CSRF, canonical contact and adult age then confirms fresh grants', async () => {
  const wire = fixture();
  expect(await completeCustomerProfile(wire.client, input)).toEqual(profile);
  expect(wire.requests[0]?.method).toBe('PUT');
  expect(wire.requests[0]?.headers.get('x-csrf-token')).toBe('csrf');
  expect(wire.requests[0]?.headers.has('authorization')).toBe(false);
  expect(await wire.requests[0]?.clone().json()).toEqual({
    fullName: 'Customer identity',
    phone: '+923001234567',
    age: 22,
    gender: 'female',
  });
  expect(wire.requests[1]?.url).toBe('https://web.example.test/api/v1/me');
});
it('AUTH-C: institution is optional and additive Owner capability is preserved', async () => {
  const wire = fixture();
  expect(
    (await completeCustomerProfile(wire.client, { ...input, institution: ' Institute ' }))
      .capabilities.owner,
  ).toBe(true);
  expect(await wire.requests[0]?.clone().json()).toMatchObject({ institution: 'Institute' });
});
it.each([
  { age: '17' },
  { age: '121' },
  { age: '18.5' },
  { age: '' },
  { fullName: 'a' },
  { phone: 'invalid' },
  { gender: 'other' },
  { cnic: '3520212345678' },
  { dateOfBirth: '2000-01-01' },
])('AUTH-C SEC: invalid or legacy web profile fields cannot reach the API', async (change) => {
  const wire = fixture();
  await expect(completeCustomerProfile(wire.client, { ...input, ...change })).rejects.toThrow();
  expect(wire.requests).toHaveLength(0);
});
it('SEC: malformed saved profile cannot create an optimistic capability', async () => {
  const wire = fixture([{ capabilities: { customer: true } }]);
  await expect(completeCustomerProfile(wire.client, input)).rejects.toThrow();
  expect(wire.requests).toHaveLength(1);
});
it.each([
  { ...profile, capabilities: { ...profile.capabilities, customer: false } },
  { ...profile, user: { ...profile.user, id: randomUUID() } },
])('SEC: stale or mismatched fresh capability cannot enter the Customer space', async (fresh) => {
  const wire = fixture([profile, fresh]);
  await expect(completeCustomerProfile(wire.client, input)).rejects.toThrow(
    'Profile confirmation unavailable',
  );
});

it('AUTH-C CHG-006: optional private avatar is submitted only as a validated file reference', async () => {
  const wire = fixture(),
    photo = randomUUID();
  await completeCustomerProfile(wire.client, { ...input, profilePhotoFileId: photo });
  expect(await wire.requests[0]?.json()).toMatchObject({ profilePhotoFileId: photo });
  const invalid = fixture();
  await expect(
    completeCustomerProfile(invalid.client, { ...input, profilePhotoFileId: 'invalid' }),
  ).rejects.toThrow();
  expect(invalid.requests).toHaveLength(0);
});
