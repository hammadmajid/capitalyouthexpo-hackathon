import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import { readProfileDetails } from './profile-details.js';
const id = '550e8400-e29b-41d4-a716-446655440000';
const details = {
  userId: id,
  fullName: '',
  email: null,
  emailVerified: false,
  phone: null,
  gender: null,
  cnicLast4: null,
  profilePhotoFileId: null,
  customer: null,
  owner: null,
};
function wire(value: unknown, bearer = false) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: bearer
      ? { kind: 'bearer', accessToken: async () => 'access' }
      : { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json(value);
    },
  });
  return { client, requests };
}
it.each([false, true])(
  'AUTH-C SEC: private edit reads preserve cookie/bearer boundaries (%s)',
  async (bearer) => {
    const w = wire(details, bearer);
    expect(await readProfileDetails(w.client, id)).toEqual(details);
    expect(w.requests).toHaveLength(1);
    const request = w.requests[0];
    expect(request?.url).toBe('https://api.example.test/v1/me/profile-details');
    expect(request?.method).toBe('GET');
    expect(request?.headers.has('X-CSRF-Token')).toBe(false);
    expect(request?.headers.get('Authorization')).toBe(bearer ? 'Bearer access' : null);
    expect(request?.credentials).toBe(bearer ? 'omit' : 'include');
  },
);
it('SEC: a valid projection for another identity cannot prefill the current form', async () => {
  const w = wire({ ...details, userId: '550e8400-e29b-41d4-a716-446655440001' });
  await expect(readProfileDetails(w.client, id)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it.each([{ ...details, cnic: '6110112345671' }, { ...details, owner: { url: 'private' } }, {}])(
  'SEC: private or malformed projections fail closed',
  async (value) => {
    await expect(readProfileDetails(wire(value).client, id)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  },
);
