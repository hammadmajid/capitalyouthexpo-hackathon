/// <reference types="jest" />
import { useState } from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { OwnerProfilePhoto } from './owner-profile-photo';
import { uploadSelectedDocument } from '../lib/private-file';
import { readOwnFileUrl, submitProfileReview } from '@hsm/api-client';
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('../lib/owner-photo-state', () => ({
  readOwnerPhotoState: jest.fn(async (_client, saved) => ({
    uri: saved ? 'https://storage.example.test/photo' : undefined,
    pending: false,
  })),
}));
jest.mock('../lib/owner-photo-draft', () => ({
  readOwnerPhotoDraft: jest.fn(async () => undefined),
  keepOwnerPhotoDraft: jest.fn(async () => undefined),
  clearOwnerPhotoDraft: jest.fn(async () => undefined),
}));
jest.mock('../lib/runtime', () => ({ client: {} }));
jest.mock('../lib/private-file', () => ({
  uploadSelectedDocument: jest.fn(),
  PendingDocumentUpload: class extends Error {},
}));
const mockDelete = jest.fn(),
  mockCopy = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    readonly uri: string;
    exists = true;
    constructor(root: string | { uri: string }, name = '') {
      this.uri = (typeof root === 'string' ? root : root.uri) + name;
    }
    copy = mockCopy;
    delete = mockDelete;
  },
}));
jest.mock('@hsm/api-client', () => {
  const actual = jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client');
  return {
    ...actual,
    readOwnFileUrl: jest.fn(),
    submitProfileReview: jest.fn(),
    retainedCommand: () => new actual.RetainedCommand(() => '10000000-0000-4000-8000-000000000001'),
  };
});
const saved = '10000000-0000-4000-8000-000000000002';
const selected = '10000000-0000-4000-8000-000000000003';
const busy = jest.fn();
function Fixture({ existing = false, reviews = true }: { existing?: boolean; reviews?: boolean }) {
  const [value, setValue] = useState<string | null | undefined>(existing ? saved : undefined);
  return (
    <OwnerProfilePhoto
      userId="owner"
      saved={existing ? saved : null}
      value={value}
      onChange={setValue}
      reviews={reviews}
      disabled={false}
      onBusy={busy}
    />
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readOwnFileUrl).mockResolvedValue({
    url: 'https://storage.example.test/photo',
    expiresAt: '2026-11-01T01:00:00Z',
  });
  jest.mocked(uploadSelectedDocument).mockResolvedValue(selected);
  jest.mocked(submitProfileReview).mockResolvedValue({
    id: saved,
    userId: saved,
    kind: 'profile_photo',
    status: 'pending',
    version: 1,
    submittedAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  });
});
test('OWN-001: no photo renders a camera without requiring a photo or optional instructions', async () => {
  await render(<Fixture />);
  expect(screen.getByRole('button', { name: 'Add profile photo' })).toBeVisible();
  expect(screen.queryByText(/optional/i)).toBeNull();
  expect(readOwnFileUrl).not.toHaveBeenCalled();
});
test('SEC-003: a clean selected image previews privately and can be removed before submission', async () => {
  await render(<Fixture reviews={false} />);
  await userEvent.press(screen.getByRole('button', { name: 'Add profile photo' }));
  await waitFor(() => expect(readOwnFileUrl).toHaveBeenCalledWith({}, selected));
  expect(screen.getByLabelText('Owner profile photo')).toBeVisible();
  await userEvent.press(screen.getByRole('button', { name: 'Change profile photo' }));
  await userEvent.press(screen.getByRole('button', { name: 'Delete profile photo' }));
  expect(screen.queryByLabelText('Owner profile photo')).toBeNull();
  expect(submitProfileReview).not.toHaveBeenCalled();
});
test('SEC: picker cancellation and rejected uploads preserve the saved image', async () => {
  await render(<Fixture existing />);
  await waitFor(() => expect(screen.getByLabelText('Owner profile photo')).toBeVisible());
  jest.mocked(uploadSelectedDocument).mockResolvedValueOnce(undefined);
  await userEvent.press(screen.getByRole('button', { name: 'Change profile photo' }));
  await userEvent.press(screen.getByRole('button', { name: 'Replace profile photo' }));
  expect(screen.getByLabelText('Owner profile photo')).toBeVisible();
  jest.mocked(uploadSelectedDocument).mockRejectedValueOnce(new Error('rejected'));
  await userEvent.press(screen.getByRole('button', { name: 'Change profile photo' }));
  await userEvent.press(screen.getByRole('button', { name: 'Replace profile photo' }));
  expect(screen.getByLabelText('Owner profile photo')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Remove selected photo' })).toBeNull();
});
test('SEC: changing an approved photo uses moderation and retains its original on submission', async () => {
  await render(<Fixture existing />);
  await userEvent.press(screen.getByRole('button', { name: 'Change profile photo' }));
  await userEvent.press(screen.getByRole('button', { name: 'Replace profile photo' }));
  expect(submitProfileReview).toHaveBeenCalledWith(
    {},
    'profile_photo',
    { fileId: selected, reason: 'Owner profile photo update' },
    expect.any(String),
  );
  expect(await screen.findByText('In review')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Submit photo for review' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove selected photo' })).toBeNull();
  expect(busy).toHaveBeenLastCalledWith(false);
});
test('SEC: a lost submission response retries the original intent and locks photo replacement', async () => {
  jest.mocked(submitProfileReview).mockRejectedValueOnce(new Error('network'));
  await render(<Fixture />);
  await userEvent.press(screen.getByRole('button', { name: 'Add profile photo' }));
  expect(screen.getByRole('button', { name: 'Change profile photo' })).toBeDisabled();
  await userEvent.press(screen.getByRole('button', { name: 'Retry photo request' }));
  expect(jest.mocked(submitProfileReview).mock.calls[1]).toEqual(
    jest.mocked(submitProfileReview).mock.calls[0],
  );
});
test('OWN-001: selected photo fills the circular avatar before upload or scan completes and cleans its preview', async () => {
  let finish: (id: string) => void = () => undefined;
  jest
    .mocked(uploadSelectedDocument)
    .mockImplementationOnce(async (_client, _purpose, onSelected) => {
      onSelected('file:///cache/selection.jpg');
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });
  await render(<Fixture reviews={false} />);
  await userEvent.press(screen.getByRole('button', { name: 'Add profile photo' }));
  const photo = await screen.findByLabelText('Owner profile photo');
  expect(photo.props.source.uri).toMatch(/^file:\/\/\/cache\/owner-photo-/);
  expect(busy).toHaveBeenLastCalledWith(true);
  expect(mockCopy).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(selected);
  });
  await userEvent.press(screen.getByRole('button', { name: 'Change profile photo' }));
  await userEvent.press(screen.getByRole('button', { name: 'Delete profile photo' }));
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Owner profile photo')).toBeNull();
});

test('SEC-003 / UI-001: a saved owner photo is unlinked explicitly through its pencil menu', async () => {
  await render(<Fixture existing reviews={false} />);
  await screen.findByLabelText('Owner profile photo');
  await userEvent.press(screen.getByRole('button', { name: 'Change profile photo' }));
  await userEvent.press(screen.getByRole('button', { name: 'Delete profile photo' }));
  await waitFor(() => expect(screen.queryByLabelText('Owner profile photo')).toBeNull());
  expect(screen.getByRole('button', { name: 'Add profile photo' })).toBeVisible();
  expect(submitProfileReview).not.toHaveBeenCalled();
});

test('SEC-003: read-only profiles expose no photo mutation controls', async () => {
  await render(
    <OwnerProfilePhoto
      userId="owner"
      saved={saved}
      value={saved}
      onChange={jest.fn()}
      onBusy={busy}
      reviews={false}
      editable={false}
      disabled={false}
    />,
  );
  await screen.findByLabelText('Owner profile photo');
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
