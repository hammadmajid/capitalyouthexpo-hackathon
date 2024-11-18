import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { listAdmins, readAdminAccount } from './platform-admin.js';
const id = '10000000-0000-4000-8000-000000000001';
const account = {
  userId: id,
  fullName: 'Staff fixture',
  status: 'active',
  isRoot: false,
  roles: ['support'],
};
function wire(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(body));
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'bearer', accessToken: async () => 'fixture' },
    fetch,
  });
  return { fetch, client };
}
it('ADM-001: Admin continuation and Root detail preserve exact bearer paths and contracts', async () => {
  const first = wire({ data: [account], nextCursor: id, totalCount: 2, activeRootCount: 1 });
  expect(await listAdmins(first.client, { cursor: id, limit: 1 })).toMatchObject({
    nextCursor: id,
    totalCount: 2,
  });
  const request = first.fetch.mock.calls[0]?.[0] as Request;
  expect(new URL(request.url).searchParams.get('cursor')).toBe(id);
  expect(new URL(request.url).searchParams.get('limit')).toBe('1');
  const detail = wire(account);
  expect(await readAdminAccount(detail.client, id)).toEqual(account);
  expect((detail.fetch.mock.calls[0]?.[0] as Request).url).toBe(
    'https://api.example.test/v1/admin/admins/' + id,
  );
});
it('SEC-001: invalid cursors and targets never reach the transport', () => {
  const value = wire({});
  expect(() => listAdmins(value.client, { cursor: 'bad' })).toThrow();
  expect(() => readAdminAccount(value.client, 'bad')).toThrow();
  expect(value.fetch).not.toHaveBeenCalled();
});
