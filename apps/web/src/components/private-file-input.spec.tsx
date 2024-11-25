import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { uploadPrivateFile, waitForCleanFile, UploadFailure } from '@hsm/api-client';
import { PrivateFileInput } from './private-file-input';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  uploadPrivateFile: vi.fn(),
  waitForCleanFile: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
beforeEach(() => vi.resetAllMocks());
it('PROP-001: a CSV with a generic platform MIME uses the checked CSV upload contract', async () => {
  const id = randomUUID(),
    ready = vi.fn();
  vi.mocked(uploadPrivateFile).mockResolvedValue(id);
  render(<PrivateFileInput id="csv-file" label="CSV file" purpose="import" onReady={ready} />);
  fireEvent.change(screen.getByLabelText('CSV file'), {
    target: {
      files: [
        new File(['room_number,bed_label\n101,B1'], 'inventory.csv', {
          type: 'application/octet-stream',
        }),
      ],
    },
  });
  await screen.findByText('File checked and ready.');
  expect(ready).toHaveBeenLastCalledWith(id);
  expect(uploadPrivateFile).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ purpose: 'import', mimeType: 'text/csv' }),
    expect.any(File),
  );
});
afterEach(cleanup);
function mount() {
  const onReady = vi.fn(),
    onBusy = vi.fn();
  render(
    <PrivateFileInput
      id="evidence"
      label="CNIC front"
      purpose="verification_document"
      onReady={onReady}
      onBusy={onBusy}
    />,
  );
  return { onReady, onBusy, user: userEvent.setup(), field: screen.getByLabelText('CNIC front') };
}
function pickedFile(name = 'document.pdf') {
  return new File(['test'], name, { type: 'application/pdf' });
}
it('COMM-002: chat scan transitions remain explicit until the checked file is ready', async () => {
  const id = randomUUID(),
    onReady = vi.fn(),
    onPending = vi.fn(),
    user = userEvent.setup();
  vi.mocked(uploadPrivateFile).mockRejectedValueOnce(new UploadFailure('PENDING', id));
  vi.mocked(waitForCleanFile).mockResolvedValueOnce(id);
  render(
    <PrivateFileInput
      id="chat-file"
      label="Chat attachment"
      purpose="chat_attachment"
      onReady={onReady}
      onPending={onPending}
    />,
  );
  await user.upload(screen.getByLabelText('Chat attachment'), pickedFile());
  await screen.findByText('Scanning is still in progress. Check again shortly.');
  expect(onPending).toHaveBeenLastCalledWith(true);
  expect(onReady).not.toHaveBeenCalledWith(id);
  await user.click(screen.getByText('Check scan status'));
  await screen.findByText('File checked and ready.');
  expect(onPending).toHaveBeenLastCalledWith(false);
  expect(onReady).toHaveBeenLastCalledWith(id);
  expect(uploadPrivateFile).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ purpose: 'chat_attachment' }),
    expect.any(File),
  );
});
it('AUTH-C CHG-006: real private file picker supplies bytes and accepts only the clean result without displaying identifiers', async () => {
  const id = randomUUID();
  vi.mocked(uploadPrivateFile).mockResolvedValueOnce(id);
  const f = mount(),
    file = pickedFile();
  await f.user.upload(f.field, file);
  await screen.findByText('File checked and ready.');
  expect(uploadPrivateFile).toHaveBeenCalledExactlyOnceWith(
    {},
    {
      purpose: 'verification_document',
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    },
    file,
  );
  expect(f.onReady.mock.calls).toEqual([[undefined], [id]]);
  expect(f.onBusy.mock.calls).toEqual([[true], [false]]);
  expect(document.body.textContent).not.toContain(id);
});
it('SEC: pending scan is resumable and does not upload the document again', async () => {
  const id = randomUUID();
  vi.mocked(uploadPrivateFile).mockRejectedValueOnce(new UploadFailure('PENDING', id));
  vi.mocked(waitForCleanFile).mockResolvedValueOnce(id);
  const f = mount();
  await f.user.upload(f.field, pickedFile());
  await f.user.click(await screen.findByRole('button', { name: 'Check scan status' }));
  await screen.findByText('File checked and ready.');
  expect(uploadPrivateFile).toHaveBeenCalledTimes(1);
  expect(waitForCleanFile).toHaveBeenCalledExactlyOnceWith(
    {},
    id,
    expect.objectContaining({ purpose: 'verification_document' }),
  );
  expect(f.onReady).toHaveBeenLastCalledWith(id);
});
it.each(['rejected', 'network'] as const)(
  'SEC: %s file failure never exposes raw provider details or returns an accepted document',
  async (kind) => {
    vi.mocked(uploadPrivateFile).mockRejectedValueOnce(
      kind === 'rejected'
        ? new UploadFailure('REJECTED', randomUUID())
        : new Error('private signed storage URL'),
    );
    const f = mount();
    await f.user.upload(f.field, pickedFile());
    await screen.findByText(
      kind === 'rejected'
        ? 'The file was rejected. Choose another file.'
        : 'We could not complete this request. Please try again.',
    );
    expect(f.onReady.mock.calls).toEqual([[undefined]]);
    expect(document.body.textContent).not.toContain('private signed storage URL');
  },
);
it('SEC: invalid file extension cannot request a storage upload', async () => {
  const f = mount();
  await f.user.upload(f.field, pickedFile('document.exe'));
  await screen.findByText('Choose a supported file within the size limit.');
  expect(uploadPrivateFile).not.toHaveBeenCalled();
  expect(f.onReady.mock.calls).toEqual([[undefined]]);
});

it('ONB-001 SEC: hostel logos use the private listing-photo purpose and require a clean result', async () => {
  const id = randomUUID(),
    onReady = vi.fn();
  vi.mocked(uploadPrivateFile).mockResolvedValueOnce(id);
  render(
    <PrivateFileInput
      id="logo"
      label="Hostel logo"
      purpose="listing_photo"
      onReady={onReady}
      onBusy={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('Hostel logo').getAttribute('accept')).toBe(
    'image/jpeg,image/png,image/webp',
  );
  expect(screen.getByText(/Images up to 8 MB/)).toBeDefined();
  const file = new File(['image'], 'logo.png', { type: 'image/png' });
  await userEvent.setup().upload(screen.getByLabelText('Hostel logo'), file);
  await screen.findByText('File checked and ready.');
  expect(uploadPrivateFile).toHaveBeenCalledWith(
    {},
    expect.objectContaining({ purpose: 'listing_photo', mimeType: 'image/png' }),
    file,
  );
  expect(onReady).toHaveBeenLastCalledWith(id);
  expect(document.body.textContent).not.toContain(id);
});

it.each(['resident_document', 'payment_proof'] as const)(
  'BKG-005 / PAY-008 / SEC-003: %s evidence supports PDF and still requires clean bytes',
  async (purpose) => {
    const id = randomUUID(),
      onReady = vi.fn();
    vi.mocked(uploadPrivateFile).mockResolvedValueOnce(id);
    render(
      <PrivateFileInput
        id="booking-proof"
        label="Booking document"
        purpose={purpose}
        onReady={onReady}
      />,
    );
    expect(screen.getByLabelText('Booking document').getAttribute('accept')).toBe(
      'image/jpeg,image/png,application/pdf',
    );
    expect(screen.getByText(/JPEG, PNG or PDF up to 10 MB/)).toBeDefined();
    const file = pickedFile();
    await userEvent.setup().upload(screen.getByLabelText('Booking document'), file);
    await screen.findByText('File checked and ready.');
    expect(uploadPrivateFile).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ purpose, mimeType: 'application/pdf' }),
      file,
    );
    expect(onReady).toHaveBeenLastCalledWith(id);
    expect(document.body.textContent).not.toContain(id);
  },
);
it('SEC-003: a disabled private booking picker cannot upload or disclose readiness', async () => {
  const onReady = vi.fn();
  render(
    <PrivateFileInput
      id="disabled-booking-proof"
      label="Disabled booking document"
      purpose="resident_document"
      disabled
      onReady={onReady}
    />,
  );
  expect((screen.getByLabelText('Disabled booking document') as HTMLInputElement).disabled).toBe(
    true,
  );
  await userEvent.setup().upload(screen.getByLabelText('Disabled booking document'), pickedFile());
  expect(uploadPrivateFile).not.toHaveBeenCalled();
  expect(onReady).not.toHaveBeenCalled();
});
