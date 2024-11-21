import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { StorageSizeMismatch } from './storage.js';
import { FileScanService } from './scan-service.js';
import type { ScanFile, ScanLease, ScanStore } from './scan-store.js';
import type { PrivateStorage, VirusScanner } from './ports.js';
import { quarantineKey } from './keys.js';
const now = new Date('2026-10-08T12:00:00Z'),
  id = randomUUID(),
  userId = randomUUID();
const bytes = Buffer.from('%PDF-1.7\nprivate fixture\n');
const file: ScanFile = {
  id,
  uploadedBy: userId,
  objectKey: quarantineKey('payment_proof', id),
  scanStatus: 'pending',
  upload: {
    purpose: 'payment_proof',
    fileName: 'proof.pdf',
    mimeType: 'application/pdf',
    sizeBytes: bytes.length,
  },
};
const lease: ScanLease = {
  id: randomUUID(),
  eventType: 'files.scan',
  channel: 'internal',
  recipientUserId: userId,
  payload: { fileId: id },
  leaseToken: randomUUID(),
  leaseExpiresAt: new Date(now.getTime() + 60000),
};
const store = { read: vi.fn<ScanStore['read']>(), complete: vi.fn<ScanStore['complete']>() };
const storage = {
  presignUpload: vi.fn(),
  presignDownload: vi.fn(),
  close: vi.fn(),
  read: vi.fn<PrivateStorage['read']>(),
  putVerified: vi.fn<PrivateStorage['putVerified']>(),
  remove: vi.fn<PrivateStorage['remove']>(),
};
const scanner = { scan: vi.fn<VirusScanner['scan']>() };
const service = () => new FileScanService(store, storage, scanner, () => now);
beforeEach(() => {
  vi.resetAllMocks();
  store.read.mockResolvedValue(file);
  store.complete.mockResolvedValue(true);
  storage.read.mockResolvedValue(bytes);
  storage.putVerified.mockResolvedValue(undefined);
  storage.remove.mockResolvedValue(undefined);
  scanner.scan.mockResolvedValue('clean');
});
it('SEC-003: clean bytes are validated, scanned and copied to a unique private snapshot before publication', async () => {
  await service().deliver(lease);
  expect(scanner.scan).toHaveBeenCalledWith(bytes);
  const put = storage.putVerified.mock.calls[0];
  expect(put?.[0]).toMatch(new RegExp('^private/payment_proof/' + id + '/'));
  expect(put?.[1]).toBe('application/pdf');
  expect(put?.[2]?.equals(bytes)).toBe(true);
  expect(store.complete).toHaveBeenCalledWith(
    lease,
    file,
    expect.objectContaining({ status: 'clean', objectKey: put?.[0], sha256: expect.any(Buffer) }),
    now,
  );
  expect(storage.remove).toHaveBeenCalledWith(file.objectKey);
});
it('SEC-003: detected infection and invalid actual content persist rejection without publishing a blob', async () => {
  scanner.scan.mockResolvedValue('rejected');
  await service().deliver(lease);
  expect(store.complete).toHaveBeenLastCalledWith(lease, file, { status: 'rejected' }, now);
  expect(storage.putVerified).not.toHaveBeenCalled();
  vi.clearAllMocks();
  storage.read.mockResolvedValue(Buffer.alloc(bytes.length, 65));
  await service().deliver(lease);
  expect(scanner.scan).not.toHaveBeenCalled();
  expect(store.complete).toHaveBeenCalledWith(lease, file, { status: 'rejected' }, now);
});
it.each(['read', 'scan', 'put'] as const)(
  'SEC-003: %s provider failure cannot publish a false clean verdict',
  async (phase) => {
    if (phase === 'read') storage.read.mockRejectedValue(new Error('provider'));
    if (phase === 'scan') scanner.scan.mockRejectedValue(new Error('provider'));
    if (phase === 'put') storage.putVerified.mockRejectedValue(new Error('provider'));
    await expect(service().deliver(lease)).rejects.toThrow('provider');
    expect(store.complete).not.toHaveBeenCalled();
    if (phase === 'put') expect(storage.remove.mock.calls[0]?.[0]).toMatch(/^private\//);
    else expect(storage.remove).not.toHaveBeenCalled();
  },
);
it('SEC-003: a failed publication removes only its private attempt blob and propagates the transaction failure', async () => {
  store.complete.mockRejectedValue(new Error('transaction'));
  await expect(service().deliver(lease)).rejects.toThrow('transaction');
  expect(storage.remove.mock.calls[0]?.[0]).toMatch(/^private\//);
  expect(storage.remove).not.toHaveBeenCalledWith(file.objectKey);
});
it('SEC-003: stale leases cannot erase quarantine or the current worker snapshot', async () => {
  store.complete.mockResolvedValue(false);
  await service().deliver(lease);
  expect(storage.remove.mock.calls[0]?.[0]).toMatch(/^private\//);
  expect(storage.remove).not.toHaveBeenCalledWith(file.objectKey);
  vi.clearAllMocks();
  scanner.scan.mockResolvedValue('rejected');
  await service().deliver(lease);
  expect(storage.remove).not.toHaveBeenCalled();
});
it('SEC-003: expired and malformed leases, missing files, foreign recipients and wrong keys fail closed', async () => {
  await service().deliver({ ...lease, leaseExpiresAt: now });
  expect(store.read).not.toHaveBeenCalled();
  await expect(
    service().deliver({ ...lease, payload: { fileId: id, credential: 'forbidden' } }),
  ).rejects.toThrow('INVALID_MESSAGE');
  store.read.mockResolvedValue(undefined);
  await expect(service().deliver(lease)).rejects.toThrow('INVALID_MESSAGE');
  store.read.mockResolvedValue({ ...file, uploadedBy: randomUUID() });
  await expect(service().deliver(lease)).rejects.toThrow('INVALID_MESSAGE');
  store.read.mockResolvedValue({ ...file, objectKey: randomUUID() });
  await expect(service().deliver(lease)).rejects.toThrow('INVALID_MESSAGE');
  expect(storage.putVerified).not.toHaveBeenCalled();
});
it('SEC-003: repeated delivery of a terminal file never reads, rescans or deletes its verified blob', async () => {
  store.read.mockResolvedValue({ ...file, scanStatus: 'clean' });
  await service().deliver(lease);
  expect(store.complete).toHaveBeenCalledWith(
    lease,
    { ...file, scanStatus: 'clean' },
    undefined,
    now,
  );
  expect(storage.read).not.toHaveBeenCalled();
  expect(storage.remove).not.toHaveBeenCalled();
});
it('SEC-003: cleanup failure cannot undo an accepted verdict or expose provider details', async () => {
  storage.remove.mockRejectedValue(new Error('private provider details'));
  await expect(service().deliver(lease)).resolves.toBeUndefined();
  expect(store.complete).toHaveBeenCalledOnce();
});

it('SEC-003: actual byte overflow persists rejection without scanning or publishing oversized content', async () => {
  storage.read.mockRejectedValue(new StorageSizeMismatch());
  await service().deliver(lease);
  expect(store.complete).toHaveBeenCalledWith(lease, file, { status: 'rejected' }, now);
  expect(scanner.scan).not.toHaveBeenCalled();
  expect(storage.putVerified).not.toHaveBeenCalled();
});
