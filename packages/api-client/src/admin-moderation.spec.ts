import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  listModeratedReviews,
  listModerationReports,
  readModerationHistory,
  readModerationReview,
} from './admin-moderation.js';
const id = '10000000-0000-4000-8000-000000000001';
const review = {
  reviewId: id,
  branchId: id,
  body: 'Fixture review',
  status: 'hidden',
  moderationReason: 'Policy',
  version: 2,
  createdAt: '2026-10-30T04:00:00.000Z',
  editedAt: null,
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
it('REV-006 SEC-003: restoration/status pages preserve bounded filters and bound credentials', async () => {
  const f = wire({ data: [review], nextCursor: id });
  expect(
    (await listModeratedReviews(f.client, { status: 'removed', cursor: id, limit: 1 })).nextCursor,
  ).toBe(id);
  const request = required(f.fetch.mock.calls[0])[0] as Request;
  expect(request.headers.get('Authorization')).toBe('Bearer fixture');
  expect(new URL(request.url).searchParams.get('status')).toBe('removed');
  expect(new URL(request.url).searchParams.get('cursor')).toBe(id);
  const reports = wire({ data: [], nextCursor: null });
  await listModerationReports(reports.client, { reportStatus: 'dismissed', reviewId: id });
  expect(
    new URL((required(reports.fetch.mock.calls[0])[0] as Request).url).searchParams.get(
      'reportStatus',
    ),
  ).toBe('dismissed');
});
it('AUD-003 REV-006: detail/history preserve exact target and ordered continuation', async () => {
  const f = wire(review);
  expect(await readModerationReview(f.client, id)).toEqual(review);
  expect(
    (required(f.fetch.mock.calls[0])[0] as Request).url.endsWith(
      '/v1/admin/moderation/reviews/' + id,
    ),
  ).toBe(true);
  const history = wire({ data: [], nextCursor: null });
  const cursor = review.createdAt + '|' + id;
  await readModerationHistory(history.client, id, { cursor });
  expect(
    new URL((required(history.fetch.mock.calls[0])[0] as Request).url).searchParams.get('cursor'),
  ).toBe(cursor);
});
it('SEC-001 REV-006: invalid IDs and unbounded queries never reach transport', () => {
  const f = wire({});
  expect(() => listModeratedReviews(f.client, { limit: 100 })).toThrow();
  expect(() => listModerationReports(f.client, { reportStatus: 'any' })).toThrow();
  expect(() => readModerationReview(f.client, 'invalid')).toThrow();
  expect(() => readModerationHistory(f.client, id, { cursor: 'invalid' })).toThrow();
  expect(f.fetch).not.toHaveBeenCalled();
});
it('SEC-003 REV-006: mismatched detail response never appears as the requested review', async () => {
  const f = wire({ ...review, reviewId: '10000000-0000-4000-8000-000000000002' });
  await expect(readModerationReview(f.client, id)).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture value');
  return value;
}
