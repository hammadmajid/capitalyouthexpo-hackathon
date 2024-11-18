import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createApiClient } from './client.js';
import {
  listOwnerOrganizations,
  listOwnerHostels,
  readOwnerHostel,
  listOwnerCities,
  listOwnerAreas,
  ownerSetupActions,
} from './owner-setup.js';
const id = randomUUID(),
  orgId = randomUUID(),
  cityId = randomUUID(),
  areaId = randomUUID();
const state = {
  id,
  organizationId: orgId,
  mainBranchId: areaId,
  verificationStatus: 'draft',
  missingFields: [],
};
const hostel = {
  id,
  organizationId: orgId,
  name: 'Hostel',
  logoFileId: null,
  mainBranch: null,
  missingFields: ['main_branch'],
};
function wire(value: unknown, bearer = false) {
  const requests: Request[] = [],
    response = { value, fail: false };
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: bearer
      ? { kind: 'bearer', accessToken: async () => 'access' }
      : { kind: 'cookie', csrf: () => 'csrf' },
    fetch: async (input, init) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      if (response.fail) throw new Error('transport');
      return Response.json(response.value);
    },
  });
  return { client, requests, response, actions: ownerSetupActions(client, randomUUID) };
}
it('ONB-001: owned organization, hostel and city reads preserve typed scope and pagination', async () => {
  const w = wire({ data: [{ id: orgId, name: 'Organization' }], nextCursor: null });
  expect((await listOwnerOrganizations(w.client, { limit: 100 })).data[0]?.name).toBe(
    'Organization',
  );
  w.response.value = {
    data: [{ id, organizationId: orgId, name: 'Hostel', logoFileId: null }],
    nextCursor: null,
  };
  expect((await listOwnerHostels(w.client, orgId, { limit: 1, cursor: id })).data[0]?.id).toBe(id);
  w.response.value = hostel;
  expect(await readOwnerHostel(w.client, id)).toEqual(hostel);
  w.response.value = { data: [{ id: cityId, name: 'City' }], nextCursor: null };
  expect((await listOwnerCities(w.client, { limit: 20 })).data[0]?.id).toBe(cityId);
  expect(w.requests.map((req) => new URL(req.url).pathname)).toEqual([
    '/v1/owner/organizations',
    '/v1/owner/organizations/' + orgId + '/brands',
    '/v1/owner/brands/' + id + '/onboarding',
    '/v1/owner/geography/cities',
  ]);
});
it('SEC-001: another organization or hostel cannot enter the editor', async () => {
  const w = wire({
    data: [{ id, organizationId: randomUUID(), name: 'Hostel', logoFileId: null }],
    nextCursor: null,
  });
  await expect(listOwnerHostels(w.client, orgId, { limit: 20 })).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  w.response.value = { ...hostel, id: randomUUID() };
  await expect(readOwnerHostel(w.client, id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each([false, true])(
  'ONB-001: area/child names are scoped to the selected city and parent (%s)',
  async (child) => {
    const area = {
      id,
      cityId,
      name: 'Area',
      parentId: child ? areaId : null,
      level: child ? 'sub_area' : 'sector',
    };
    const w = wire({ data: [area], nextCursor: null });
    expect(
      (
        await listOwnerAreas(w.client, cityId, {
          limit: 20,
          ...(child ? { parentId: areaId } : {}),
        })
      ).data,
    ).toEqual([area]);
  },
);
it.each([
  { cityId: randomUUID(), parentId: null, level: 'area', query: undefined },
  { cityId, parentId: null, level: 'sub_area', query: undefined },
  { cityId, parentId: randomUUID(), level: 'sub_area', query: areaId },
  { cityId, parentId: areaId, level: 'area', query: areaId },
])('SEC-001: foreign or incorrectly nested geography fails closed %#', async (input) => {
  const { query, ...area } = input,
    w = wire({ data: [{ id, name: 'Area', ...area }], nextCursor: null });
  await expect(
    listOwnerAreas(w.client, cityId, { limit: 20, ...(query ? { parentId: query } : {}) }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it.each(['create', 'basics', 'main', 'submit'] as const)(
  'ONB-001 SEC: %s uses CSRF and stable idempotency on retry',
  async (method) => {
    const w = wire(state);
    const run = () =>
      method === 'create'
        ? w.actions.create(orgId, { name: 'Hostel' })
        : method === 'submit'
          ? w.actions.submit(id)
          : w.actions[method](id, { name: 'Main hostel' });
    expect(await run()).toEqual(state);
    await run();
    expect(w.requests[0]?.headers.get('Idempotency-Key')).toBe(
      w.requests[1]?.headers.get('Idempotency-Key'),
    );
    expect(w.requests[0]?.headers.get('X-CSRF-Token')).toBe('csrf');
    expect(w.requests[0]?.credentials).toBe('include');
    expect(w.requests[0]?.headers.has('Authorization')).toBe(false);
  },
);
it('ONB-001: uncertain response retries the same intent; changed input receives a fresh key', async () => {
  const w = wire(state);
  w.response.fail = true;
  await expect(w.actions.create(orgId, { name: 'First hostel' })).rejects.toThrow();
  w.response.fail = false;
  await w.actions.create(orgId, { name: 'First hostel' });
  await w.actions.create(orgId, { name: 'Changed hostel' });
  expect(w.requests[0]?.headers.get('Idempotency-Key')).toBe(
    w.requests[1]?.headers.get('Idempotency-Key'),
  );
  expect(w.requests[1]?.headers.get('Idempotency-Key')).not.toBe(
    w.requests[2]?.headers.get('Idempotency-Key'),
  );
});
it.each(['create', 'basics', 'main', 'submit', 'invite'] as const)(
  'SEC-001: %s cannot return another scope',
  async (method) => {
    const w = wire(
      method === 'invite'
        ? {
            id,
            branchId: randomUUID(),
            status: 'pending_activation',
            expiresAt: '2026-10-13T00:00:00.000Z',
            acceptance: 'temporary_password',
          }
        : { ...state, id: randomUUID(), organizationId: randomUUID() },
    );
    const work =
      method === 'create'
        ? w.actions.create(orgId, { name: 'Hostel' })
        : method === 'submit'
          ? w.actions.submit(id)
          : method === 'invite'
            ? w.actions.invite(areaId, {
                fullName: 'Manager',
                phone: '03001234567',
                temporaryCredential: { mode: 'auto' },
              })
            : w.actions[method](id, { name: 'Hostel' });
    await expect(work).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it.each(['auto', 'manual'] as const)(
  'AUTH-M-001: %s invitation preserves bearer isolation and discards successful credential intent',
  async (mode) => {
    const invitation = {
      id,
      branchId: areaId,
      status: 'pending_activation',
      expiresAt: '2026-10-13T00:00:00.000Z',
      acceptance: 'temporary_password',
      ...(mode === 'auto' ? { generatedTempPassword: 'GeneratedPassword!778' } : {}),
    };
    const w = wire(invitation, true),
      input = {
        fullName: 'Manager',
        phone: '03001234567',
        temporaryCredential: mode === 'auto' ? { mode } : { mode, password: 'ManualPassword!778' },
      };
    expect(await w.actions.invite(areaId, input)).toEqual(invitation);
    await w.actions.invite(areaId, input);
    expect(w.requests[0]?.url).toBe(
      'https://api.example.test/v1/manage/branches/' + areaId + '/managers',
    );
    expect(w.requests[0]?.credentials).toBe('omit');
    expect(w.requests[0]?.headers.get('Authorization')).toBe('Bearer access');
    expect(w.requests[0]?.headers.has('X-CSRF-Token')).toBe(false);
    expect(w.requests[0]?.headers.get('Idempotency-Key')).not.toBe(
      w.requests[1]?.headers.get('Idempotency-Key'),
    );
    expect(await w.requests[0]?.json()).toMatchObject({
      phone: '+923001234567',
      temporaryCredential: input.temporaryCredential,
    });
  },
);
it('SEC-001: invalid paths, bodies, query and generated keys fail before dispatch', async () => {
  const w = wire(state);
  await expect(w.actions.create(orgId, { name: 'Hostel', ownerId: id })).rejects.toThrow();
  await expect(w.actions.main('bad', { name: 'Hostel' })).rejects.toThrow();
  await expect(listOwnerAreas(w.client, cityId, { limit: 101 })).rejects.toThrow();
  await expect(ownerSetupActions(w.client, () => 'bad').submit(id)).rejects.toThrow();
  expect(w.requests).toHaveLength(0);
});
it('AUTH-M-001 SEC: closing the invitation clears an uncertain manual credential intent', async () => {
  const w = wire({
    id,
    branchId: areaId,
    status: 'pending_activation',
    expiresAt: '2026-10-13T00:00:00.000Z',
    acceptance: 'temporary_password',
  });
  const input = {
    fullName: 'Manager',
    phone: '03001234567',
    temporaryCredential: { mode: 'manual', password: 'ManualPassword!778' },
  };
  w.response.fail = true;
  await expect(w.actions.invite(areaId, input)).rejects.toThrow();
  w.actions.forgetInvitation(areaId);
  w.response.fail = false;
  await w.actions.invite(areaId, input);
  expect(w.requests[0]?.headers.get('Idempotency-Key')).not.toBe(
    w.requests[1]?.headers.get('Idempotency-Key'),
  );
});

it('ONB-001: JSON draft updates preserve explicit null/false and omit undefined fields', async () => {
  const w = wire(state);
  const basics = {
    name: 'Hostel',
    category: null,
    description: null,
    phone: null,
    logoFileId: null,
    showPublicContact: false,
  };
  await w.actions.basics(id, basics);
  expect(await w.requests[0]?.json()).toEqual(basics);
  const main = {
    name: 'Branch',
    category: 'boys',
    description: 'Description',
    phone: '+923001234567',
    showPublicContact: true,
    cityId,
    areaId,
    subAreaId: null,
    addressLine: 'Branch address',
    location: { latitude: 33.7, longitude: 73.04 },
    nearbyLandmark: 'Landmark',
  };
  await w.actions.main(id, main);
  expect(await w.requests[1]?.json()).toEqual(main);
  await w.actions.basics(id, { name: 'Hostel', phone: undefined });
  expect(await w.requests[2]?.json()).toEqual({ name: 'Hostel' });
});
