import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { quarantineKey, verifiedKey, StorageSizeMismatch } from '@hsm/files';
import type { PrivateStorage } from '@hsm/files';
import type { Upload } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { FileService } from './service.js';
import type { FileRecord, FileStore, FileTransaction } from './store.js';
const now = new Date('2026-10-08T12:00:00Z');
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const bytes = Buffer.from('%PDF-1.7\nprivate fixture\n');
const id = randomUUID();
const upload: Upload = {
  purpose: 'payment_proof',
  fileName: 'proof.pdf',
  mimeType: 'application/pdf',
  sizeBytes: bytes.length,
};
const file: FileRecord = {
  id,
  uploadedBy: actor.userId,
  objectKey: quarantineKey(upload.purpose, id),
  scanStatus: 'pending',
  upload,
  sha256: null,
};
const clean: FileRecord = {
  ...file,
  scanStatus: 'clean',
  sha256: Buffer.alloc(32),
  objectKey: verifiedKey(upload.purpose, id),
};
function fixture(record = file) {
  const transaction = {
    read: vi.fn<FileTransaction['read']>().mockResolvedValue(record),
    create: vi.fn<FileTransaction['create']>().mockResolvedValue(undefined),
    queue: vi.fn<FileTransaction['queue']>().mockResolvedValue(undefined),
    reject: vi.fn<FileTransaction['reject']>().mockResolvedValue(undefined),
    acceptAvatar: vi.fn<FileTransaction['acceptAvatar']>().mockResolvedValue(undefined),
    audit: vi.fn<FileTransaction['audit']>().mockResolvedValue(undefined),
  };
  const actors: Actor[] = [];
  const store: FileStore = {
    transaction: async (current, work) => {
      actors.push(current);
      return work(transaction);
    },
  };
  const storage = {
    read: vi.fn<PrivateStorage['read']>().mockResolvedValue(bytes),
    presignUpload: vi
      .fn<PrivateStorage['presignUpload']>()
      .mockResolvedValue('https://storage.invalid/upload'),
    presignDownload: vi
      .fn<PrivateStorage['presignDownload']>()
      .mockResolvedValue('https://storage.invalid/download'),
    putVerified: vi.fn<PrivateStorage['putVerified']>(),
    remove: vi.fn<PrivateStorage['remove']>().mockResolvedValue(undefined),
    close: vi.fn(),
  };
  return {
    transaction,
    actors,
    storage,
    store,
    service: new FileService(store, storage, () => now),
  };
}
afterEach(() => vi.useRealTimers());
it('SEC-003: completes a private avatar without waiting for a scan job', async () => {
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const avatar: FileRecord = {
    ...file,
    objectKey: quarantineKey('avatar', id),
    upload: {
      purpose: 'avatar',
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: image.length,
    },
  };
  const value = fixture(avatar);
  value.storage.read.mockResolvedValue(image);
  expect(await value.service.complete(actor, id)).toMatchObject({ scanStatus: 'clean' });
  const key = value.storage.putVerified.mock.calls[0]?.[0];
  expect(key).toMatch(new RegExp('^private/avatar/' + id + '/'));
  expect(value.storage.putVerified).toHaveBeenCalledWith(key, 'image/jpeg', image);
  expect(value.transaction.acceptAvatar).toHaveBeenCalledWith(avatar, key, expect.any(Buffer));
  expect(value.transaction.queue).not.toHaveBeenCalled();
  expect(value.storage.remove).toHaveBeenCalledWith(avatar.objectKey);
});
it('SEC-003: upload persists opaque private metadata and signs only its quarantine key', async () => {
  const value = fixture();
  const response = await value.service.upload(actor, upload);
  expect(value.actors).toEqual([actor]);
  expect(value.transaction.create).toHaveBeenCalledWith(
    response.fileId,
    quarantineKey(upload.purpose, response.fileId),
    upload,
  );
  expect(value.storage.presignUpload).toHaveBeenCalledWith(
    quarantineKey(upload.purpose, response.fileId),
    upload,
  );
  expect(response).toMatchObject({
    headers: { 'content-type': 'application/pdf' },
    expiresAt: '2026-10-08T12:05:00.000Z',
  });
  expect(response).not.toHaveProperty('objectKey');
  await expect(value.service.upload(actor, { ...upload, fileName: 'proof.exe' })).rejects.toThrow();
  expect(value.transaction.create).toHaveBeenCalledOnce();
});
it('SEC-003: the default clock and close use real provider lifecycle without returning stored metadata', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const value = fixture();
  const service = new FileService(value.store, value.storage);
  expect((await service.upload(actor, upload)).expiresAt).toBe('2026-10-08T12:05:00.000Z');
  service.close();
  expect(value.storage.close).toHaveBeenCalledOnce();
  const response = await service.read(actor, id);
  expect(response).toEqual({
    fileId: id,
    scanStatus: 'pending',
    mimeType: 'application/pdf',
    sizeBytes: bytes.length,
  });
  expect(() => service.read(actor, 'invalid')).toThrow();
});
it('SEC-003: actual content validates before a second live transaction queues scan work', async () => {
  const value = fixture();
  expect((await value.service.complete(actor, id)).scanStatus).toBe('pending');
  expect(value.actors).toEqual([actor, actor]);
  expect(value.storage.read).toHaveBeenCalledWith(file.objectKey, bytes.length);
  expect(value.transaction.queue).toHaveBeenCalledWith(file);
  expect(value.transaction.reject).not.toHaveBeenCalled();
});
it.each(['clean', 'rejected'] as const)(
  'SEC-003: terminal %s completion never rereads or queues provider work',
  async (scanStatus) => {
    const value = fixture({ ...clean, scanStatus });
    expect((await value.service.complete(actor, id)).scanStatus).toBe(scanStatus);
    expect(value.storage.read).not.toHaveBeenCalled();
    expect(value.transaction.queue).not.toHaveBeenCalled();
  },
);
it.each(['magic', 'size'] as const)(
  'SEC-003: invalid actual %s persists rejection before returning a safe error',
  async (kind) => {
    const value = fixture();
    if (kind === 'magic') value.storage.read.mockResolvedValue(Buffer.alloc(bytes.length, 65));
    else value.storage.read.mockRejectedValue(new StorageSizeMismatch());
    await expect(value.service.complete(actor, id)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 400,
    });
    expect(value.transaction.reject).toHaveBeenCalledWith(file);
    expect(value.transaction.queue).not.toHaveBeenCalled();
  },
);
it('SEC-003: provider outage cannot mark a pending file rejected or queue work', async () => {
  const value = fixture();
  value.storage.read.mockRejectedValue(new Error('Private provider information'));
  await expect(value.service.complete(actor, id)).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 503,
  });
  expect(value.transaction.reject).not.toHaveBeenCalled();
  expect(value.transaction.queue).not.toHaveBeenCalled();
});
it('SEC-003: pending metadata must refer to the generated quarantine key', async () => {
  const value = fixture({ ...file, objectKey: randomUUID() });
  await expect(value.service.complete(actor, id)).rejects.toMatchObject({ status: 409 });
  expect(value.storage.read).not.toHaveBeenCalled();
});
it.each([
  { ...file, objectKey: randomUUID() },
  { ...file, upload: { ...upload, purpose: 'resident_document' as const } },
  { ...file, upload: { ...upload, mimeType: 'image/png' as const } },
  { ...file, upload: { ...upload, sizeBytes: bytes.length + 1 } },
])(
  'SEC-003: changed pending metadata cannot reuse a previous validation result',
  async (current) => {
    const value = fixture();
    value.transaction.read.mockResolvedValueOnce(file).mockResolvedValueOnce(current);
    await expect(value.service.complete(actor, id)).rejects.toMatchObject({ status: 409 });
    expect(value.transaction.queue).not.toHaveBeenCalled();
  },
);
it.each([false, true])(
  'SEC-003: a concurrent terminal publication supersedes earlier validation (invalid=%s)',
  async (invalid) => {
    const value = fixture();
    value.transaction.read.mockResolvedValueOnce(file).mockResolvedValueOnce(clean);
    if (invalid) value.storage.read.mockResolvedValue(Buffer.alloc(bytes.length, 65));
    expect((await value.service.complete(actor, id)).scanStatus).toBe('clean');
    expect(value.transaction.reject).not.toHaveBeenCalled();
    expect(value.transaction.queue).not.toHaveBeenCalled();
  },
);
it('SEC-003: protected download audits before signing and returns only the short URL DTO', async () => {
  const value = fixture(clean);
  const response = await value.service.download(actor, id);
  expect(value.transaction.audit).toHaveBeenCalledWith(clean);
  expect(value.transaction.audit.mock.invocationCallOrder[0]).toBeLessThan(
    value.storage.presignDownload.mock.invocationCallOrder[0] ?? 0,
  );
  expect(value.storage.presignDownload).toHaveBeenCalledWith(clean.objectKey, id, upload.mimeType);
  expect(response).toEqual({
    url: 'https://storage.invalid/download',
    expiresAt: '2026-10-08T12:01:00.000Z',
  });
});
it.each([
  { ...clean, scanStatus: 'pending' as const },
  { ...clean, scanStatus: 'rejected' as const },
  { ...clean, sha256: null },
  { ...clean, sha256: Buffer.alloc(31) },
  { ...clean, objectKey: quarantineKey(upload.purpose, id) },
  { ...clean, uploadedBy: randomUUID() },
])('SEC-003: unverified or foreign documents cannot be audited or signed', async (record) => {
  const value = fixture(record);
  await expect(value.service.download(actor, id)).rejects.toThrow();
  expect(value.transaction.audit).not.toHaveBeenCalled();
  expect(value.storage.presignDownload).not.toHaveBeenCalled();
});
it('SEC-003: audit failure prevents signing; signing failure propagates for transaction rollback', async () => {
  const value = fixture(clean);
  value.transaction.audit.mockRejectedValueOnce(new Error('Audit failed'));
  await expect(value.service.download(actor, id)).rejects.toThrow('Audit failed');
  expect(value.storage.presignDownload).not.toHaveBeenCalled();
  value.storage.presignDownload.mockRejectedValueOnce(new Error('Provider details'));
  await expect(value.service.download(actor, id)).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 503,
  });
  value.storage.presignUpload.mockRejectedValueOnce(new Error('Provider details'));
  await expect(value.service.upload(actor, upload)).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 503,
  });
});

it.each(['clean', 'rejected'] as const)(
  'SEC-003: a terminal %s verdict wins when quarantine disappears during completion',
  async (scanStatus) => {
    const value = fixture();
    value.transaction.read
      .mockResolvedValueOnce(file)
      .mockResolvedValueOnce({ ...clean, scanStatus });
    value.storage.read.mockRejectedValue(new Error('Quarantine already removed'));
    expect((await value.service.complete(actor, id)).scanStatus).toBe(scanStatus);
    expect(value.transaction.queue).not.toHaveBeenCalled();
    expect(value.transaction.reject).not.toHaveBeenCalled();
    expect(value.actors).toEqual([actor, actor]);
  },
);
