import { beforeEach, expect, it, vi } from 'vitest';
import {
  accessProfileReview,
  accessProfileReviewEvidence,
  listProfileReviews,
  readOwnFileUrl,
  type ApiClient,
} from '@hsm/api-client';
import { readOwnerPhotoState } from './owner-photo-state';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  accessProfileReview: vi.fn(),
  accessProfileReviewEvidence: vi.fn(),
  listProfileReviews: vi.fn(),
  readOwnFileUrl: vi.fn(),
}));
const client = {} as ApiClient;
beforeEach(() => vi.clearAllMocks());
it('OWN-001 SEC: reopening uses the real pending review and audited self-evidence preview', async () => {
  vi.mocked(listProfileReviews).mockResolvedValue({
    data: [{ id: 'request' }],
    nextCursor: null,
  } as Awaited<ReturnType<typeof listProfileReviews>>);
  vi.mocked(accessProfileReview).mockResolvedValue({ proposedPhotoFileId: 'photo' } as Awaited<
    ReturnType<typeof accessProfileReview>
  >);
  vi.mocked(accessProfileReviewEvidence).mockResolvedValue({
    url: 'https://storage.example.test/pending',
    expiresAt: '2026-11-01T12:00:00Z',
  });
  expect(await readOwnerPhotoState(client, null, true)).toEqual({
    uri: 'https://storage.example.test/pending',
    pending: true,
  });
  expect(accessProfileReview).toHaveBeenCalledWith(
    client,
    'profile_photo',
    'request',
    expect.any(Object),
    true,
  );
  expect(accessProfileReviewEvidence).toHaveBeenCalledWith(
    client,
    'profile_photo',
    'request',
    'photo',
    expect.any(Object),
    true,
  );
  expect(readOwnFileUrl).not.toHaveBeenCalled();
});
it('OWN-001: approved photo is restored from its stored file ID rather than the previous local preview', async () => {
  vi.mocked(listProfileReviews).mockResolvedValue({ data: [], nextCursor: null });
  vi.mocked(readOwnFileUrl).mockResolvedValue({
    url: 'https://storage.example.test/saved',
    expiresAt: '2026-11-01T12:00:00Z',
  });
  expect(await readOwnerPhotoState(client, 'saved', true)).toEqual({
    uri: 'https://storage.example.test/saved',
    pending: false,
  });
});
it('SEC: disabled moderation never requests the privileged review API; empty photo remains empty', async () => {
  expect(await readOwnerPhotoState(client, null, false)).toEqual({
    uri: undefined,
    pending: false,
  });
  expect(listProfileReviews).not.toHaveBeenCalled();
});
