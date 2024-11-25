import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GalleryMedia } from '@hsm/contracts';
import { GalleryImageCard } from './gallery-image-card';
afterEach(cleanup);
const image: GalleryMedia = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  branchId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  fileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  altText: 'Saved exterior',
  sortOrder: 4,
  roomId: null,
  bedId: null,
  publishedAt: null,
  archivedAt: null,
  scanStatus: 'clean',
  version: 'a'.repeat(64),
};
it('SEC-003: private drafts render no generic private URL or public image request', () => {
  render(
    <GalleryImageCard
      image={image}
      canEdit={false}
      canPublish={false}
      disabled={false}
      onAction={vi.fn()}
    />,
  );
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('Private draft; no public preview.')).toBeDefined();
  expect(screen.queryByRole('button')).toBeNull();
  expect(document.body.textContent).not.toContain(image.fileId);
});
it('ROOM-003: published preview uses only the controlled stream and failure remains truthful', () => {
  render(
    <GalleryImageCard
      image={{ ...image, publishedAt: '2026-10-16T10:00:00.000Z' }}
      canEdit={false}
      canPublish={false}
      disabled={false}
      onAction={vi.fn()}
    />,
  );
  const preview = screen.getByRole('img');
  const destination = new URL(preview.getAttribute('src') ?? '', window.location.origin);
  expect(destination.href).toBe(window.location.origin + '/api/v1/marketplace/media/' + image.id);
  fireEvent.error(preview);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('Public preview is currently unavailable.')).toBeDefined();
});
it.each([
  ['Edit image publication', 'edit'],
  ['Choose as cover', 'cover'],
  ['Archive image', 'archive'],
])('ROOM-003: %s opens the actual image action without an implicit write', (label, kind) => {
  const action = vi.fn();
  render(<GalleryImageCard image={image} canEdit canPublish disabled={false} onAction={action} />);
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(action).toHaveBeenCalledWith({ kind, initial: image });
});
it('SEC-003: revoked scans hide previews and prohibit cover selection while allowing unpublication/archival', () => {
  render(
    <GalleryImageCard
      image={{ ...image, scanStatus: 'rejected', publishedAt: '2026-10-16T10:00:00.000Z' }}
      canEdit
      canPublish
      disabled={false}
      onAction={vi.fn()}
    />,
  );
  expect(screen.queryByRole('img')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Choose as cover' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Edit image publication' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
it('AUD-001: archived image history remains visible without destructive controls', () => {
  render(
    <GalleryImageCard
      image={{ ...image, archivedAt: '2026-10-16T10:00:00.000Z' }}
      canEdit
      canPublish
      disabled={false}
      onAction={vi.fn()}
    />,
  );
  expect(screen.getByText('Archived image. Its history is retained.')).toBeDefined();
  expect(screen.queryByRole('button')).toBeNull();
});

it('ACC-004: listing-only editors can edit private metadata but cannot choose covers or change published assets', () => {
  const view = render(
    <GalleryImageCard
      image={image}
      canEdit
      canPublish={false}
      disabled={false}
      onAction={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Edit image publication' })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Choose as cover' })).toBeNull();
  view.rerender(
    <GalleryImageCard
      image={{ ...image, publishedAt: '2026-10-17T00:00:00.000Z' }}
      canEdit
      canPublish={false}
      disabled={false}
      onAction={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Edit image publication' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive image' })).toBeNull();
});
