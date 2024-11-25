import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient, ClientFailure } from '@hsm/api-client';
import { completeOwnerProfile } from './owner-profile';
const input = {
  fullName: 'Owner identity',
  phone: '03001234567',
  cnic: '6110112345671',
  cnicFrontFileId: randomUUID(),
  cnicBackFileId: randomUUID(),
  address: 'Owner contact address',
  agreementAccepted: true,
  agreementVersion: 'owner-foundation-v1',
};
function fixture() {
  const profile = {
    user: {
      id: randomUUID(),
      fullName: input.fullName,
      email: 'owner@example.test',
      emailVerified: true,
      cnicLast4: '5671',
    },
    capabilities: { customer: true, owner: true, managerOf: [], admin: null },
  };
  const replies: unknown[] = [profile, profile],
    requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'cookie', csrf: () => 'csrf value' },
    fetch: async (raw, init) => {
      requests.push(raw instanceof Request ? raw : new Request(raw, init));
      return Response.json(replies.shift());
    },
  });
  return { profile, replies, requests, client };
}
it('AUTH-C CHG-006: Owner completion canonicalizes contact, keeps additive Customer capability and confirms live same-user Owner grant', async () => {
  const f = fixture();
  expect(await completeOwnerProfile(f.client, input)).toEqual(f.profile);
  expect(f.requests.map((r) => [r.method, new URL(r.url).pathname])).toEqual([
    ['PUT', '/v1/me/owner-profile'],
    ['GET', '/v1/me'],
  ]);
  expect(await f.requests[0]?.json()).toEqual({ ...input, phone: '+923001234567' });
  expect(f.requests[0]?.headers.get('X-CSRF-Token')).toBe('csrf value');
  expect(f.requests.every((r) => !r.headers.has('authorization'))).toBe(true);
});
it('AUTH-C CHG-006: optional organization and clean private photo reference are submitted without extra form data', async () => {
  const f = fixture(),
    photo = randomUUID();
  await completeOwnerProfile(f.client, {
    ...input,
    organizationName: 'Personal organization',
    profilePhotoFileId: photo,
  });
  expect(await f.requests[0]?.json()).toMatchObject({
    organizationName: 'Personal organization',
    profilePhotoFileId: photo,
  });
});
it.each([
  { agreementAccepted: false },
  { agreementVersion: 'unapproved version' },
  { cnicFrontFileId: input.cnicBackFileId },
  { cnic: 'invalid' },
  { phone: 'invalid' },
  { fullName: '' },
  { address: '' },
  { extraPrivateField: 'not allowed' },
])('AUTH-C SEC: invalid or incomplete Owner boundary never calls the API', async (change) => {
  const f = fixture();
  await expect(completeOwnerProfile(f.client, { ...input, ...change })).rejects.toThrow();
  expect(f.requests).toHaveLength(0);
});
it.each(['different_identity', 'no_owner'] as const)(
  'SEC: %s on fresh confirmation cannot enter Owner space',
  async (change) => {
    const f = fixture();
    f.replies[1] =
      change === 'different_identity'
        ? { ...f.profile, user: { ...f.profile.user, id: randomUUID() } }
        : { ...f.profile, capabilities: { ...f.profile.capabilities, owner: false } };
    await expect(completeOwnerProfile(f.client, input)).rejects.toBeInstanceOf(ClientFailure);
  },
);

it('OWN-001: omitted CNIC photos are accepted without inventing evidence', async () => {
  const f = fixture();
  const withoutPhotos = { ...input, cnicFrontFileId: undefined, cnicBackFileId: undefined };
  await completeOwnerProfile(f.client, withoutPhotos);
  const body = await f.requests[0]?.json();
  expect(body).not.toHaveProperty('cnicFrontFileId');
  expect(body).not.toHaveProperty('cnicBackFileId');
});
