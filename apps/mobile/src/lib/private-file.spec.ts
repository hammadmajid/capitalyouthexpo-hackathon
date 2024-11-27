import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { uploadPrivateFile, UploadFailure, ClientFailure } from '@hsm/api-client';
import type { ApiClient } from '@hsm/api-client';
import { uploadSelectedDocument, PendingDocumentUpload } from './private-file';
const { picker, remove, state } = vi.hoisted(() => ({
  picker: vi.fn(),
  remove: vi.fn(),
  state: { root: 'file:///cache/', mime: 'application/pdf', exists: true },
}));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: picker }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
const { compress } = vi.hoisted(() => ({ compress: vi.fn() }));
vi.mock('./photo-compress', async (original) => ({
  ...(await original<typeof import('./photo-compress')>()),
  compressPhoto: compress,
}));
vi.mock('expo-file-system', () => ({
  Paths: {
    get cache() {
      return { uri: state.root };
    },
  },
  File: class extends Blob {
    readonly uri: string;
    constructor(uri: string) {
      super(['test'], { type: state.mime });
      this.uri = uri;
    }
    get exists() {
      return state.exists;
    }
    delete() {
      remove(this.uri);
    }
  },
}));
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  uploadPrivateFile: vi.fn(),
}));
const asset = {
  name: 'document.pdf',
  uri: 'file:///cache/DocumentPicker/document.pdf',
  mimeType: 'application/pdf',
  size: 4,
  lastModified: 0,
};
const client = {} as ApiClient;
it('PROP-001: a CSV selected with an Android generic MIME retains the CSV upload contract', async () => {
  const id = randomUUID();
  picker.mockResolvedValue({
    canceled: false,
    assets: [{ ...asset, name: 'inventory.csv', mimeType: 'application/octet-stream' }],
  });
  vi.mocked(uploadPrivateFile).mockResolvedValue(id);
  await expect(uploadSelectedDocument(client, 'import', vi.fn())).resolves.toBe(id);
  expect(picker).toHaveBeenCalledWith(expect.objectContaining({ type: ['text/csv'] }));
  expect(uploadPrivateFile).toHaveBeenCalledWith(
    client,
    expect.objectContaining({ purpose: 'import', mimeType: 'text/csv' }),
    expect.any(Blob),
    expect.anything(),
  );
});
beforeEach(() => {
  vi.resetAllMocks();
  state.root = 'file:///cache/';
  state.mime = 'application/pdf';
  state.exists = true;
  picker.mockResolvedValue({ canceled: false, assets: [asset] });
  compress.mockImplementation(async (_uri: string, mimeType: string) => ({
    uri: 'file:///cache/ImageManipulator/small',
    mimeType: mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
  }));
  vi.mocked(uploadPrivateFile).mockResolvedValue(randomUUID());
});
it('AUTH-C CHG-006: native private selection uploads its app-cache copy and deletes it before accepting the result', async () => {
  const selected = vi.fn(),
    id = randomUUID();
  vi.mocked(uploadPrivateFile).mockResolvedValueOnce(id);
  expect(await uploadSelectedDocument(client, 'verification_document', selected)).toBe(id);
  expect(picker).toHaveBeenCalledWith({
    type: ['image/jpeg', 'image/png', 'application/pdf'],
    multiple: false,
    copyToCacheDirectory: true,
  });
  expect(uploadPrivateFile).toHaveBeenCalledWith(
    client,
    {
      purpose: 'verification_document',
      fileName: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: 4,
    },
    expect.any(Blob),
    { transport: expect.any(Function) },
  );
  expect(selected).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledExactlyOnceWith(asset.uri);
});
it('AUTH-C: canceled selection preserves the previous reference and never reads or deletes a source', async () => {
  picker.mockResolvedValueOnce({ canceled: true, assets: null });
  const selected = vi.fn();
  expect(await uploadSelectedDocument(client, 'avatar', selected)).toBeUndefined();
  expect(selected).not.toHaveBeenCalled();
  expect(uploadPrivateFile).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
it('AUTH-C: optional avatar uses image-only selection and metadata from the actual file when picker fields are absent', async () => {
  state.mime = 'image/png';
  state.root = 'file:///cache';
  picker.mockResolvedValueOnce({
    canceled: false,
    assets: [{ name: 'photo.png', uri: 'file:///cache/photo.png' }],
  });
  await uploadSelectedDocument(client, 'avatar', vi.fn());
  expect(picker.mock.calls[0]?.[0]).toMatchObject({
    type: ['image/jpeg', 'image/png', 'image/webp'],
  });
  expect(uploadPrivateFile).toHaveBeenCalledWith(
    client,
    expect.objectContaining({ mimeType: 'image/png', sizeBytes: 4 }),
    expect.any(Blob),
    expect.any(Object),
  );
});
it('SEC: missing selected asset cannot request an upload', async () => {
  picker.mockResolvedValueOnce({ canceled: false, assets: [] });
  await expect(uploadSelectedDocument(client, 'avatar', vi.fn())).rejects.toBeInstanceOf(
    ClientFailure,
  );
  expect(uploadPrivateFile).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
it.each([
  'file:///documents/original.pdf',
  'file:///cache/../documents/original.pdf',
  'https://private.example.test/file.pdf',
  'file:///cache-other/file.pdf',
])('SEC: a picker path outside the application cache is never uploaded or deleted', async (uri) => {
  picker.mockResolvedValueOnce({ canceled: false, assets: [{ ...asset, uri }] });
  await expect(
    uploadSelectedDocument(client, 'verification_document', vi.fn()),
  ).rejects.toBeInstanceOf(ClientFailure);
  expect(uploadPrivateFile).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
it('SEC: invalid metadata clears the former selection and deletes only the cached copy', async () => {
  picker.mockResolvedValueOnce({ canceled: false, assets: [{ ...asset, name: 'document.exe' }] });
  const selected = vi.fn();
  await expect(uploadSelectedDocument(client, 'verification_document', selected)).rejects.toThrow();
  expect(selected).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith(asset.uri);
  expect(uploadPrivateFile).not.toHaveBeenCalled();
});
it.each(['network', 'rejected'] as const)(
  'SEC: %s upload failure still removes the temporary document',
  async (kind) => {
    const failure =
      kind === 'network'
        ? new ClientFailure('NETWORK_UNAVAILABLE')
        : new UploadFailure('REJECTED', randomUUID());
    vi.mocked(uploadPrivateFile).mockRejectedValueOnce(failure);
    await expect(uploadSelectedDocument(client, 'verification_document', vi.fn())).rejects.toBe(
      failure,
    );
    expect(remove).toHaveBeenCalledWith(asset.uri);
  },
);
it('SEC: pending scan retains only resumable metadata and file ID, never the source URI or bytes', async () => {
  const id = randomUUID();
  vi.mocked(uploadPrivateFile).mockRejectedValueOnce(new UploadFailure('PENDING', id));
  const error = await uploadSelectedDocument(client, 'verification_document', vi.fn()).catch(
    (value: unknown) => value,
  );
  expect(error).toBeInstanceOf(PendingDocumentUpload);
  expect(error).toMatchObject({
    fileId: id,
    upload: {
      purpose: 'verification_document',
      fileName: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: 4,
    },
  });
  expect(JSON.stringify(error)).not.toContain(asset.uri);
  expect(remove).toHaveBeenCalledWith(asset.uri);
});
it('SEC: failed cache cleanup cannot return an accepted document and exposes only a safe failure', async () => {
  remove.mockImplementationOnce(() => {
    throw new Error('private local file path');
  });
  await expect(
    uploadSelectedDocument(client, 'verification_document', vi.fn()),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: 'Unexpected response' });
});
it('SEC: a cache copy already removed by the system is never deleted twice', async () => {
  state.exists = false;
  await uploadSelectedDocument(client, 'verification_document', vi.fn());
  expect(remove).not.toHaveBeenCalled();
});

it('ONB-001 SEC: native logo selection accepts image-only private listing photos and removes the cache copy', async () => {
  state.mime = 'image/png';
  picker.mockResolvedValue({
    canceled: false,
    assets: [{ ...asset, name: 'logo.png', mimeType: 'image/png' }],
  });
  const ready = vi.fn();
  await uploadSelectedDocument(client, 'listing_photo', ready);
  expect(picker).toHaveBeenCalledWith(
    expect.objectContaining({ type: ['image/jpeg', 'image/png', 'image/webp'] }),
  );
  expect(uploadPrivateFile).toHaveBeenCalledWith(
    client,
    expect.objectContaining({ purpose: 'listing_photo', mimeType: 'image/png' }),
    expect.any(Blob),
    expect.any(Object),
  );
  expect(remove).toHaveBeenCalledWith(asset.uri);
  expect(ready).toHaveBeenCalledOnce();
});

it.each(['resident_document', 'payment_proof'] as const)(
  'BKG-001 / PAY-008 / SEC-003: %s uses private PDF selection and deletes only its cache copy',
  async (purpose) => {
    const selected = vi.fn();
    await uploadSelectedDocument(client, purpose, selected);
    expect(picker).toHaveBeenCalledWith({
      type: ['image/jpeg', 'image/png', 'application/pdf'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    expect(uploadPrivateFile).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ purpose }),
      expect.any(Blob),
      { transport: expect.any(Function) },
    );
    expect(remove).toHaveBeenCalledExactlyOnceWith(asset.uri);
  },
);

it('PROP-001: photos are compressed to a JPEG before upload and both cache copies are deleted', async () => {
  const id = randomUUID();
  state.mime = 'image/jpeg';
  picker.mockResolvedValue({
    canceled: false,
    assets: [{ ...asset, name: 'IMG_1.HEIC.webp', mimeType: 'image/webp', size: 7000000 }],
  });
  vi.mocked(uploadPrivateFile).mockResolvedValue(id);
  await expect(uploadSelectedDocument(client, 'listing_photo', vi.fn())).resolves.toBe(id);
  expect(compress).toHaveBeenCalledWith('file:///cache/DocumentPicker/document.pdf', 'image/webp');
  expect(uploadPrivateFile).toHaveBeenCalledWith(
    client,
    expect.objectContaining({ fileName: 'IMG_1.HEIC.jpg', mimeType: 'image/jpeg', sizeBytes: 4 }),
    expect.objectContaining({ uri: 'file:///cache/ImageManipulator/small' }),
    expect.anything(),
  );
  expect(remove).toHaveBeenCalledWith('file:///cache/ImageManipulator/small');
  expect(remove).toHaveBeenCalledWith('file:///cache/DocumentPicker/document.pdf');
});

it('SEC-003: CNIC camera accepts images only and rejects a PDF before selection/upload', async () => {
  picker.mockResolvedValue({ canceled: false, assets: [asset] });
  const selected = vi.fn();
  await expect(
    uploadSelectedDocument(client, 'resident_document', selected, { imagesOnly: true }),
  ).rejects.toThrow();
  expect(picker).toHaveBeenCalledWith(
    expect.objectContaining({ type: ['image/jpeg', 'image/png'] }),
  );
  expect(selected).not.toHaveBeenCalled();
  expect(uploadPrivateFile).not.toHaveBeenCalled();
});
