import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  listAdminInstitutions,
  readAdminAnnouncements,
  readAdminInstitution,
  saveAdminInstitution,
} from './admin-phase4.js';
const id = '10000000-0000-4000-8000-000000000001';
const input = {
  name: 'Institute',
  shortName: null,
  cityId: id,
  areaId: null,
  address: null,
  latitude: 33.7,
  longitude: 73,
  aliases: ['Alias'],
  isActive: false,
  publicApproved: false,
};
function wire(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(body));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'fixture' },
      fetch,
    }),
  };
}
it('ADM-010 GEO-003: exact bounded reader filters and private institution identity are preserved', async () => {
  const notices = wire({ data: [], nextCursor: null });
  await readAdminAnnouncements(notices.client, { status: 'cancelled', cursor: id, limit: 1 });
  expect((notices.fetch.mock.calls[0]?.[0] as Request).url).toContain(
    '/v1/admin/announcement-history?',
  );
  const institutions = wire({ data: [], nextCursor: null });
  await listAdminInstitutions(institutions.client, { active: 'inactive', q: 'Institute' });
  expect(
    new URL((institutions.fetch.mock.calls[0]?.[0] as Request).url).searchParams.get('active'),
  ).toBe('inactive');
  const detail = wire({ ...input, id, revision: '0' });
  expect(await readAdminInstitution(detail.client, id)).toMatchObject({ isActive: false });
});
it('GEO-003 SEC-003: existing institution writes preserve identity and exact idempotent body', async () => {
  const value = wire({ id, isActive: false, publicApproved: false });
  await saveAdminInstitution(
    value.client,
    {
      ...input,
      changeReason: 'Verified institution details',
      reapprove: false,
      expectedRevision: '0',
    },
    id,
    id,
  );
  const request = value.fetch.mock.calls[0]?.[0] as Request;
  expect(request.method).toBe('PUT');
  expect(request.headers.get('Idempotency-Key')).toBe(id);
  expect(await request.clone().json()).toEqual({
    ...input,
    type: 'university',
    changeReason: 'Verified institution details',
    reapprove: false,
    expectedRevision: '0',
  });
  expect(() => listAdminInstitutions(value.client, { cursor: 'bad' })).toThrow();
});
