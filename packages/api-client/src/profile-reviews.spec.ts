import { expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';
import {
  accessProfileReview,
  decideProfileReview,
  listProfileReviews,
  submitProfileReview,
} from './profile-reviews.js';
const id = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002',
  at = '2026-10-30T16:00:00.000Z';
const review = {
  id,
  userId: other,
  kind: 'identity',
  status: 'pending',
  version: 1,
  submittedAt: at,
  updatedAt: at,
};
function wire(response: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(response));
  return {
    fetch,
    client: createApiClient({
      baseUrl: 'https://api.example.test',
      authentication: { kind: 'bearer', accessToken: async () => 'fixture' },
      fetch,
    }),
  };
}
it('HMA-015: submission normalizes CNIC, preserves proof order and exact idempotent intent', async () => {
  const w = wire(review),
    input = {
      cnic: '12345-1234567-1',
      evidenceFileIds: [id, other],
      reason: 'Correct documented legal identity',
    };
  await submitProfileReview(w.client, 'identity', input, id);
  const request = w.fetch.mock.calls[0]?.[0] as Request;
  expect(request.headers.get('Idempotency-Key')).toBe(id);
  expect(await request.clone().json()).toEqual({ ...input, cnic: '1234512345671' });
  expect(request.url).toContain('/me/profile-reviews/identity');
});
it('HMA-015 SEC-003: private access is explicit, purpose-bound and rejects mismatched detail identity', async () => {
  const w = wire({
    review: { ...review, id: other },
    reason: 'Documented correction request',
    previousFullName: 'Private previous',
    proposedFullName: 'Private proposed',
    previousCnicLast4: '1234',
    proposedCnic: null,
    previousPhotoFileId: null,
    proposedPhotoFileId: null,
    currentPhoto: false,
    evidenceFileIds: [id],
  });
  await expect(
    accessProfileReview(w.client, 'identity', id, {
      justification: 'Validate legal correction evidence',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const request = w.fetch.mock.calls[0]?.[0] as Request;
  expect(await request.clone().json()).toEqual({
    justification: 'Validate legal correction evidence',
  });
  await expect(
    accessProfileReview(w.client, 'identity', id, { justification: 'short' }),
  ).rejects.toThrow();
});
it('HMA-015: identity decisions cannot request photo withdrawal or override server revisions', async () => {
  const w = wire({ ...review, status: 'approved', version: 2 });
  const input = {
    action: 'approve',
    reason: 'Evidence matches requested correction',
    expectedVersion: 1,
  };
  await decideProfileReview(w.client, 'identity', id, input, other);
  expect(await (w.fetch.mock.calls[0]?.[0] as Request).clone().json()).toEqual(input);
  await expect(
    decideProfileReview(w.client, 'identity', id, { ...input, action: 'withdraw' }, other),
  ).rejects.toThrow();
  expect(() => listProfileReviews(w.client, 'identity', { limit: 51 })).toThrow();
});
it('HMA-015 SEC-003: metadata pages reject accidental raw private values', async () => {
  const w = wire({ data: [{ ...review, proposedCnic: '1234512345671' }], nextCursor: null });
  await expect(listProfileReviews(w.client, 'identity')).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
});
