import { beforeEach, expect, it, vi } from 'vitest';
import {
  archiveListingImage,
  attachListingImage,
  editListingImage,
  selectListingCover,
  type ApiClient,
} from '@hsm/api-client';
import type { GalleryMedia } from '@hsm/contracts';
import { runMediaCommand } from './owner-media-command';
vi.mock('@hsm/api-client', () => ({
  archiveListingImage: vi.fn(),
  attachListingImage: vi.fn(),
  editListingImage: vi.fn(),
  selectListingCover: vi.fn(),
}));
const client = {} as ApiClient;
const old: GalleryMedia = {
  id: 'old',
  branchId: 'branch',
  fileId: 'old-file',
  roomId: 'room',
  bedId: 'bed',
  publishedAt: '2026-11-02T00:00:00Z',
  archivedAt: null,
  version: 'old-version',
  scanStatus: 'clean',
  altText: 'Bed A',
  sortOrder: 2,
};
const added: GalleryMedia = {
  ...old,
  id: 'new',
  fileId: 'new-file',
  version: 'new-version',
  publishedAt: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(attachListingImage).mockResolvedValue(added);
});
it('ROOM-003: replacement preserves target, ordering, publication and retry key before archiving original', async () => {
  const target = { kind: 'bed' as const, roomId: 'room', bedId: 'bed' };
  await runMediaCommand(
    client,
    'branch',
    { kind: 'replace', image: old, fileId: 'new-file', target },
    'retry-key',
  );
  expect(attachListingImage).toHaveBeenCalledWith(
    client,
    'branch',
    { fileId: 'new-file', altText: 'Bed A', sortOrder: 2, target },
    'retry-key',
  );
  expect(editListingImage).toHaveBeenCalledWith(
    client,
    'branch',
    'new',
    'new-version',
    { altText: 'Bed A', sortOrder: 2, published: true },
    'retry-key',
  );
  expect(archiveListingImage).toHaveBeenCalledWith(
    client,
    'branch',
    'old',
    'old-version',
    expect.any(String),
    'retry-key',
  );
  expect(archiveListingImage).toHaveBeenCalledTimes(1);
  expect(vi.mocked(editListingImage).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(archiveListingImage).mock.invocationCallOrder[0] ?? 0,
  );
});
it('ROOM-003: failed clean-file attach or publication never removes the approved original', async () => {
  vi.mocked(attachListingImage).mockRejectedValueOnce(new Error('Scan unavailable'));
  await expect(
    runMediaCommand(client, 'branch', { kind: 'replace', image: old, fileId: 'new-file' }, 'key'),
  ).rejects.toThrow();
  expect(archiveListingImage).not.toHaveBeenCalled();
  vi.mocked(editListingImage).mockRejectedValueOnce(new Error('Publication denied'));
  await expect(
    runMediaCommand(client, 'branch', { kind: 'replace', image: old, fileId: 'new-file' }, 'key'),
  ).rejects.toThrow();
  expect(archiveListingImage).not.toHaveBeenCalled();
});
it('ROOM-002: a newly uploaded cover uses the actual returned image version', async () => {
  await runMediaCommand(
    client,
    'branch',
    { kind: 'attach', fileId: 'new-file', altText: 'Entrance', sortOrder: 3, cover: true },
    'key',
  );
  expect(selectListingCover).toHaveBeenCalledWith(client, 'branch', 'new', 'new-version', 'key');
  expect(archiveListingImage).not.toHaveBeenCalled();
});
it('PROP-001: an added photo is published at once and the cover uses the published version', async () => {
  vi.mocked(editListingImage).mockResolvedValueOnce({
    ...old,
    id: 'new',
    version: 'published-version',
    publishedAt: '2026-11-14T00:00:00Z',
  });
  await runMediaCommand(
    client,
    'branch',
    {
      kind: 'attach',
      fileId: 'new-file',
      altText: 'Room',
      sortOrder: 3,
      cover: true,
      publish: true,
    },
    'key',
  );
  expect(editListingImage).toHaveBeenCalledWith(
    client,
    'branch',
    'new',
    'new-version',
    expect.objectContaining({ published: true }),
    'key',
  );
  expect(selectListingCover).toHaveBeenCalledWith(
    client,
    'branch',
    'new',
    'published-version',
    'key',
  );
});
it('PROP-001: an added photo stays private when the actor may not publish', async () => {
  await runMediaCommand(
    client,
    'branch',
    { kind: 'attach', fileId: 'new-file', altText: 'Room', sortOrder: 3 },
    'key',
  );
  expect(editListingImage).not.toHaveBeenCalled();
});
