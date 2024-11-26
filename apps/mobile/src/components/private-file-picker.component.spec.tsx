/// <reference types="jest" />
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { ApiFailure, UploadFailure, waitForCleanFile } from '@hsm/api-client';
import { uploadSelectedDocument, PendingDocumentUpload } from '../lib/private-file';
import { actorClient, sessions } from '../lib/runtime';
import { PrivateFilePicker } from './private-file-picker';
jest.mock('../lib/runtime', () => ({
  client: {},
  actorClient: jest.fn(),
  sessions: { restore: jest.fn() },
}));
jest.mock('../lib/private-file', () => {
  const { UploadFailure } = jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client');
  return {
    uploadSelectedDocument: jest.fn(),
    PendingDocumentUpload: class extends UploadFailure {
      upload: unknown;
      constructor(id: string, upload: unknown) {
        super('PENDING', id);
        this.upload = upload;
      }
    },
  };
});
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  waitForCleanFile: jest.fn(),
}));
const id = '550e8400-e29b-41d4-a716-446655440000';
const metadata = {
  purpose: 'verification_document' as const,
  fileName: 'proof.pdf',
  mimeType: 'application/pdf' as const,
  sizeBytes: 4,
};
test('COMM-002: native chat scans notify the composer until a clean file is ready', async () => {
  const chatMetadata = { ...metadata, purpose: 'chat_attachment' as const },
    onReady = jest.fn(),
    onPending = jest.fn(),
    user = userEvent.setup();
  jest
    .mocked(uploadSelectedDocument)
    .mockRejectedValue(new PendingDocumentUpload(id, chatMetadata));
  jest.mocked(waitForCleanFile).mockResolvedValueOnce(id);
  await render(
    <PrivateFilePicker
      actorId="10000000-0000-4000-8000-000000000001"
      label="Chat attachment"
      purpose="chat_attachment"
      onReady={onReady}
      onBusy={jest.fn()}
      onPending={onPending}
    />,
  );
  jest.mocked(actorClient).mockResolvedValue({} as Awaited<ReturnType<typeof actorClient>>);
  await user.press(screen.getByRole('button', { name: 'Choose Chat attachment' }));
  expect(onPending).toHaveBeenLastCalledWith(true);
  expect(onReady).not.toHaveBeenCalledWith(id);
  await user.press(screen.getByRole('button', { name: 'Check scan status for Chat attachment' }));
  expect(await screen.findByText('File checked and ready.')).toBeVisible();
  expect(onPending).toHaveBeenLastCalledWith(false);
  expect(onReady).toHaveBeenLastCalledWith(id);
  expect(waitForCleanFile).toHaveBeenCalledWith({}, id, chatMetadata);
});
beforeEach(() => jest.resetAllMocks());
test('SEC-003: an expired actor session refreshes before opening the private picker', async () => {
  jest
    .mocked(actorClient)
    .mockRejectedValueOnce(
      new ApiFailure({
        type: 'urn:hsm:test',
        title: 'Expired',
        detail: 'Expired',
        status: 401,
        code: 'TOKEN_EXPIRED',
        traceId: 'test',
      }),
    )
    .mockResolvedValueOnce({} as Awaited<ReturnType<typeof actorClient>>);
  jest
    .mocked(sessions.restore)
    .mockResolvedValue({} as Awaited<ReturnType<typeof sessions.restore>>);
  jest.mocked(uploadSelectedDocument).mockResolvedValue(id);
  const onReady = jest.fn();
  await render(
    <PrivateFilePicker
      actorId="owner"
      label="room photo"
      purpose="listing_photo"
      onReady={onReady}
      onBusy={jest.fn()}
    />,
  );
  await userEvent.setup().press(screen.getByRole('button', { name: 'Choose room photo' }));
  expect(sessions.restore).toHaveBeenCalledTimes(1);
  expect(jest.mocked(actorClient).mock.calls.slice(0, 2)).toEqual([['owner'], ['owner']]);
  expect(uploadSelectedDocument).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenLastCalledWith(id);
});
async function mount() {
  const onReady = jest.fn(),
    onBusy = jest.fn();
  await render(
    <PrivateFilePicker
      label="CNIC front"
      purpose="verification_document"
      onReady={onReady}
      onBusy={onBusy}
    />,
  );
  return { onReady, onBusy, user: userEvent.setup() };
}
test('AUTH-C: native picker accepts only the adapter clean result and reports upload busy state', async () => {
  jest.mocked(uploadSelectedDocument).mockImplementation(async (_client, _purpose, selected) => {
    selected('file:///cache/selection.jpg');
    return id;
  });
  const { onReady, onBusy, user } = await mount();
  await user.press(screen.getByRole('button', { name: 'Choose CNIC front' }));
  expect(await screen.findByText('File checked and ready.')).toBeVisible();
  expect(onReady.mock.calls).toEqual([[undefined], [id]]);
  expect(onBusy.mock.calls).toEqual([[true], [false]]);
  expect(screen.queryByText(id)).toBeNull();
});
test('AUTH-C: canceled native selection preserves the previous accepted reference', async () => {
  jest.mocked(uploadSelectedDocument).mockResolvedValue(undefined);
  const { onReady, user } = await mount();
  await user.press(screen.getByRole('button', { name: 'Choose CNIC front' }));
  expect(onReady).not.toHaveBeenCalled();
  expect(screen.queryByText('File checked and ready.')).toBeNull();
});
test('AUTH-C: pending scans resume without reopening the picker or reuploading bytes', async () => {
  jest.mocked(uploadSelectedDocument).mockRejectedValue(new PendingDocumentUpload(id, metadata));
  jest
    .mocked(waitForCleanFile)
    .mockRejectedValueOnce(new UploadFailure('PENDING', id))
    .mockResolvedValueOnce(id);
  const { onReady, user } = await mount();
  await user.press(screen.getByRole('button', { name: 'Choose CNIC front' }));
  const retry = await screen.findByRole('button', { name: 'Check scan status for CNIC front' });
  await user.press(retry);
  expect(onReady).not.toHaveBeenCalled();
  await user.press(retry);
  expect(await screen.findByText('File checked and ready.')).toBeVisible();
  expect(waitForCleanFile).toHaveBeenCalledWith({}, id, metadata);
  expect(uploadSelectedDocument).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledWith(id);
});
test('SEC: provider errors invalidate the reference and cannot expose private file paths', async () => {
  jest.mocked(uploadSelectedDocument).mockRejectedValue(new Error('private source URI'));
  const { onReady, user } = await mount();
  await user.press(screen.getByRole('button', { name: 'Choose CNIC front' }));
  expect(await screen.findByText('Something went wrong on this screen. Try again.')).toBeVisible();
  expect(onReady).toHaveBeenCalledWith(undefined);
  expect(screen.queryByText('private source URI')).toBeNull();
});
test('SEC: rejected documents cannot become accepted profile evidence', async () => {
  jest.mocked(uploadSelectedDocument).mockRejectedValue(new UploadFailure('REJECTED', id));
  const { onReady, user } = await mount();
  await user.press(screen.getByRole('button', { name: 'Choose CNIC front' }));
  expect(await screen.findByText('The file was rejected. Choose another file.')).toBeVisible();
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledWith(undefined);
});

test('ONB-001 SEC: native hostel logos use private listing-photo purpose and show the image size limit', async () => {
  jest.mocked(uploadSelectedDocument).mockResolvedValue(id);
  const onReady = jest.fn();
  await render(
    <PrivateFilePicker
      label="Hostel logo"
      purpose="listing_photo"
      onReady={onReady}
      onBusy={jest.fn()}
    />,
  );
  expect(screen.getByText('Private image up to 5 MB.')).toBeVisible();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Choose Hostel logo' }));
  await waitFor(() => expect(onReady).toHaveBeenCalledWith(id));
  expect(uploadSelectedDocument).toHaveBeenCalledWith({}, 'listing_photo', expect.any(Function));
  expect(screen.queryByText('File checked and ready.')).toBeNull();
});

test.each(['resident_document', 'payment_proof'] as const)(
  'SEC-003: %s cannot upload under a replacement account credential',
  async (purpose) => {
    jest.mocked(actorClient).mockRejectedValue(new Error('Account changed'));
    jest.mocked(uploadSelectedDocument).mockResolvedValue(id);
    const onReady = jest.fn();
    await render(
      <PrivateFilePicker
        actorId={id}
        label="Booking document"
        purpose={purpose}
        onReady={onReady}
        onBusy={jest.fn()}
      />,
    );
    await userEvent.setup().press(screen.getByRole('button', { name: 'Choose Booking document' }));
    await screen.findByText('Something went wrong on this screen. Try again.');
    expect(uploadSelectedDocument).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledWith(undefined);
  },
);

test('PAY-008 / SEC-003: direct staff payment evidence uses the actor-bound private PDF pipeline', async () => {
  jest.mocked(actorClient).mockResolvedValue({} as Awaited<ReturnType<typeof actorClient>>);
  jest.mocked(uploadSelectedDocument).mockResolvedValue(id);
  const onReady = jest.fn();
  await render(
    <PrivateFilePicker
      actorId={id}
      label="Direct payment proof"
      purpose="payment_proof"
      onReady={onReady}
      onBusy={jest.fn()}
    />,
  );
  expect(screen.getByText('Photo up to 5 MB, or PDF up to 10 MB.')).toBeVisible();
  await userEvent
    .setup()
    .press(screen.getByRole('button', { name: 'Choose Direct payment proof' }));
  await waitFor(() => expect(onReady).toHaveBeenCalledWith(id));
  expect(screen.queryByText('File checked and ready.')).toBeNull();
  expect(actorClient).toHaveBeenCalledWith(id);
  expect(uploadSelectedDocument).toHaveBeenCalledWith({}, 'payment_proof', expect.any(Function));
  expect(onReady).toHaveBeenCalledWith(id);
  expect(screen.queryByText(id)).toBeNull();
});

test('UI-001 / SEC-003: selected photos expose a corner pencil with replace and delete', async () => {
  jest.mocked(actorClient).mockResolvedValue({} as Awaited<ReturnType<typeof actorClient>>);
  const ready = jest.fn();
  await render(
    <PrivateFilePicker
      actorId="owner"
      label="bed photo"
      purpose="listing_photo"
      fileId={id}
      onReady={ready}
      onBusy={jest.fn()}
    />,
  );
  const user = userEvent.setup();
  expect(screen.queryByRole('button', { name: 'Delete bed photo' })).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Edit bed photo' }));
  expect(screen.getByRole('button', { name: 'Replace bed photo' })).toBeVisible();
  await user.press(screen.getByRole('button', { name: 'Delete bed photo' }));
  expect(ready).toHaveBeenLastCalledWith(undefined);
});
test('UI-001 / SEC-003: cancelled replacement retains the selected photo', async () => {
  jest.mocked(actorClient).mockResolvedValue({} as Awaited<ReturnType<typeof actorClient>>);
  jest.mocked(uploadSelectedDocument).mockResolvedValue(undefined);
  const ready = jest.fn();
  await render(
    <PrivateFilePicker
      actorId="owner"
      label="bed photo"
      purpose="listing_photo"
      fileId={id}
      onReady={ready}
      onBusy={jest.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Edit bed photo' }));
  await user.press(screen.getByRole('button', { name: 'Replace bed photo' }));
  expect(ready).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Edit bed photo' })).toBeVisible();
});

test('UI-001 / SEC-003: externally clearing a photo removes the old preview and pencil', async () => {
  const props = {
    label: 'bed photo',
    purpose: 'listing_photo' as const,
    onReady: jest.fn(),
    onBusy: jest.fn(),
  };
  const view = await render(<PrivateFilePicker {...props} fileId={id} />);
  expect(screen.getByRole('button', { name: 'Edit bed photo' })).toBeVisible();
  await view.rerender(<PrivateFilePicker {...props} fileId={undefined} />);
  expect(screen.queryByRole('button', { name: 'Edit bed photo' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Choose bed photo' })).toBeVisible();
});
test('UI-001 / SEC-003: rejected replacement never removes an existing clean photo', async () => {
  jest.mocked(uploadSelectedDocument).mockRejectedValue(new UploadFailure('REJECTED', id));
  const ready = jest.fn();
  await render(
    <PrivateFilePicker
      label="bed photo"
      purpose="listing_photo"
      fileId={id}
      onReady={ready}
      onBusy={jest.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Edit bed photo' }));
  await user.press(screen.getByRole('button', { name: 'Replace bed photo' }));
  await screen.findByText('The file was rejected. Choose another file.');
  expect(ready).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Edit bed photo' })).toBeVisible();
});
