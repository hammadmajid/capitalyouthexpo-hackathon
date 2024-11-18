import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import { readCustomAmenities, saveCustomAmenity } from './custom-amenities.js';
const branch = '10000000-0000-4000-8000-000000000001',
  org = '10000000-0000-4000-8000-000000000002';
const row = {
  code: 'custom_lounge',
  name: 'Study lounge',
  category: 'facilities',
  organizationId: org,
  isActive: true,
  version: 'a'.repeat(64),
};
function client(data: unknown) {
  return createApiClient({
    baseUrl: 'https://api.example.test',
    authentication: { kind: 'bearer', accessToken: async () => 'test-access' },
    fetch: vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
  });
}
it('LIST-001: accepts scoped catalog rows and rejects foreign scope, duplicates and stalled continuation', async () => {
  const page = {
    branchId: branch,
    organizationId: org,
    data: [row],
    nextCursor: null,
    canEdit: true,
  };
  await expect(readCustomAmenities(client(page), branch)).resolves.toEqual(page);
  for (const invalid of [
    { ...page, branchId: org },
    { ...page, organizationId: branch },
    { ...page, data: [row, row] },
    { ...page, nextCursor: 'another_code' },
  ])
    await expect(readCustomAmenities(client(invalid), branch)).rejects.toThrow();
  await expect(readCustomAmenities(client(page), branch, { cursor: row.code })).rejects.toThrow();
});
it('LIST-001: validates archive results and preserves explicit command versions', async () => {
  const command = {
    kind: 'archive',
    code: row.code,
    version: row.version,
    reason: 'No longer offered',
  };
  await expect(saveCustomAmenity(client(row), branch, command, org)).rejects.toThrow();
  await expect(
    saveCustomAmenity(client({ ...row, isActive: false }), branch, command, org),
  ).resolves.toMatchObject({ isActive: false });
});
