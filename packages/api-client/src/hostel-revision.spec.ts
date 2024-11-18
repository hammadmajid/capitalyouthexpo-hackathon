import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  decideHostelRevision,
  listHostelRevisions,
  readHostelRevision,
  readHostelRevisionReview,
  saveHostelRevision,
  submitHostelRevision,
  withdrawHostelRevision,
} from './hostel-revision.js';
const brand = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000009',
  branch = '10000000-0000-4000-8000-000000000002',
  revisionId = '10000000-0000-4000-8000-000000000003',
  key = '10000000-0000-4000-8000-000000000004';
const at = '2026-11-15T10:00:00.000Z';
function wire(body: unknown) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(body));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'fixture' },
      fetch,
    }),
  };
}
const live = (id = brand) => ({
  id,
  organizationId: '10000000-0000-4000-8000-000000000005',
  name: 'Live hostel',
  logoFileId: null,
  mainBranch: null,
  missingFields: ['main_branch'],
});
const revision = {
  id: revisionId,
  brandId: brand,
  branchId: branch,
  status: 'draft',
  changes: { basics: { name: 'New name' }, main: null },
  version: 1,
  submittedAt: null,
  decidedAt: null,
  decisionNote: null,
  updatedAt: at,
};
it('CHG-041: Owner calls carry the idempotency key and keep the hostel they asked for', async () => {
  const { client, fetch } = wire({ live: live(), revision });
  expect((await readHostelRevision(client, brand)).revision?.status).toBe('draft');
  await saveHostelRevision(
    client,
    brand,
    { expectedVersion: null, basics: { name: 'New name' } },
    key,
  );
  await submitHostelRevision(client, brand, { expectedVersion: 1 }, key);
  await withdrawHostelRevision(client, brand, { expectedVersion: 2 }, key);
  const urls = fetch.mock.calls.map(([request]) => (request as Request).url);
  expect(urls).toEqual([
    'https://api.example.test/v1/owner/brands/' + brand + '/revision',
    'https://api.example.test/v1/owner/brands/' + brand + '/revision',
    'https://api.example.test/v1/owner/brands/' + brand + '/revision/submit',
    'https://api.example.test/v1/owner/brands/' + brand + '/revision/withdraw',
  ]);
  expect((fetch.mock.calls[1]?.[0] as Request).headers.get('Idempotency-Key')).toBe(key);
});
it('CHG-041: a response for another hostel is refused', async () => {
  const { client } = wire({ live: live(other), revision: null });
  await expect(readHostelRevision(client, brand)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
it('CHG-041: Admin review reads the queue, the side-by-side detail and decides', async () => {
  const queue = wire({
    data: [
      {
        id: revisionId,
        brandId: brand,
        branchId: branch,
        branchName: 'Live hostel',
        organizationName: 'Org',
        submittedAt: at,
      },
    ],
    nextCursor: null,
  });
  expect((await listHostelRevisions(queue.client)).data).toHaveLength(1);
  const detail = wire({
    revision: { ...revision, status: 'submitted', submittedAt: at },
    branchName: 'Live hostel',
    organizationName: 'Org',
    live: live(),
  });
  expect((await readHostelRevisionReview(detail.client, revisionId)).live.name).toBe('Live hostel');
  const mismatch = wire({
    revision: { ...revision, status: 'submitted', submittedAt: at },
    branchName: 'Live hostel',
    organizationName: 'Org',
    live: live(other),
  });
  await expect(readHostelRevisionReview(mismatch.client, revisionId)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  const decided = wire({ ...revision, status: 'approved', decidedAt: at, version: 3 });
  expect(
    (
      await decideHostelRevision(
        decided.client,
        revisionId,
        { expectedVersion: 2, action: 'approve' },
        key,
      )
    ).status,
  ).toBe('approved');
  await expect(
    Promise.resolve().then(() =>
      decideHostelRevision(
        decided.client,
        revisionId,
        { expectedVersion: 2, action: 'reject' },
        key,
      ),
    ),
  ).rejects.toThrow();
});
