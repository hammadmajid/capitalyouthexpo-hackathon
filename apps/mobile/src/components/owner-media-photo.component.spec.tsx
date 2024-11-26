/// <reference types="jest" />
import { render, screen, userEvent } from '@testing-library/react-native';
import type { GalleryMedia } from '@hsm/contracts';
import { OwnerMediaPhoto } from './owner-media-photo';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { url: 'https://example.test/private-image' } }),
}));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn() }));
jest.mock('./private-file-picker', () => ({ PrivateFilePicker: () => null }));
const image: GalleryMedia = {
  id: 'image',
  branchId: 'branch',
  fileId: 'file',
  roomId: null,
  bedId: null,
  altText: 'Test room',
  sortOrder: 1,
  scanStatus: 'clean',
  version: '1',
  publishedAt: null,
  archivedAt: null,
};
it('PROP-001 keeps photo actions contextual and preserves authorized operations', async () => {
  const run = jest.fn();
  await render(
    <OwnerMediaPhoto
      actorId="owner"
      image={image}
      canEdit
      canPublish
      busy={false}
      setUploading={jest.fn()}
      run={run}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Edit photo' }));
  expect(screen.getByRole('button', { name: 'Publish photo' })).toBeTruthy();
  expect(screen.queryByLabelText('Photo order')).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Make cover' }));
  expect(run).toHaveBeenLastCalledWith({ kind: 'cover', image });
  await user.press(screen.getByRole('button', { name: 'Remove photo' }));
  expect(run).toHaveBeenLastCalledWith({ kind: 'archive', image });
  await user.press(screen.getByRole('button', { name: 'Close photo controls' }));
  expect(screen.queryByRole('button', { name: 'Publish photo' })).toBeNull();
});
it('PROP-001 exposes no editing or publishing controls to read-only viewers', async () => {
  await render(
    <OwnerMediaPhoto
      actorId="viewer"
      image={image}
      canEdit={false}
      canPublish={false}
      busy={false}
      setUploading={jest.fn()}
      run={jest.fn()}
    />,
  );
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
