import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  decideResidentAccountLink,
  readOwnResidentLinkStatus,
  readResidentAccountLinks,
} from './resident-account-links.js';
const branchId = '10000000-0000-4000-8000-000000000001',
  requestId = '10000000-0000-4000-8000-000000000002';
function fixture(data: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      fetch,
      authentication: { kind: 'bearer', accessToken: async () => 'test-access' },
    }),
  };
}
it('RES-001: validates the exact branch/request and sends only the hostel decision', async () => {
  const f = fixture({ success: true });
  expect(
    await decideResidentAccountLink(f.client, branchId, requestId, { action: 'approve' }),
  ).toEqual({ success: true });
  const request = f.fetch.mock.calls[0]?.[0] as Request;
  expect(request.url).toBe(
    `https://api.example.test/v1/branches/${branchId}/residents/account-link-requests/${requestId}`,
  );
  expect(request.headers.get('Authorization')).toBe('Bearer test-access');
  expect(await request.json()).toEqual({ action: 'approve' });
  expect(() =>
    decideResidentAccountLink(f.client, branchId, requestId, {
      action: 'approve',
      userId: requestId,
    }),
  ).toThrow();
});
it('ACC-004: own status rejects unexpected resident details', async () => {
  const f = fixture({ pending: true, residentName: 'Private resident' });
  await expect(readOwnResidentLinkStatus(f.client)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('RES-001: reads the branch queue and rejects an invalid cursor before transport', async () => {
  const f = fixture({ data: [], nextCursor: null });
  expect(await readResidentAccountLinks(f.client, branchId)).toEqual({
    data: [],
    nextCursor: null,
  });
  expect(() => readResidentAccountLinks(f.client, branchId, 'bad')).toThrow();
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
