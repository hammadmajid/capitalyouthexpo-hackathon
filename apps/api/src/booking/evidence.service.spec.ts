import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { bookingDocuments, files } from '@hsm/db';
import type { PrivateStorage } from '@hsm/files';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { DomainError } from '@hsm/contracts';
import { BookingEvidenceService } from './evidence.service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  branchId = randomUUID();
const documentId = randomUUID(),
  customerId = randomUUID(),
  fileId = randomUUID();
const now = new Date('2026-10-15T10:00:00Z');
beforeEach(() => vi.resetAllMocks());
function fixture() {
  const store = queryFixture(),
    presignDownload = vi.fn<PrivateStorage['presignDownload']>();
  store.enqueue(bookingDocuments, [
    { id: documentId, branchId, bookingId: null, customerUserId: customerId, fileId },
  ]);
  const objectKey = 'private/resident_document/' + fileId + '/' + randomUUID();
  store.enqueue(files, [
    { id: fileId, sha256: Buffer.alloc(32), objectKey, mimeType: 'application/pdf' },
  ]);
  const service = new BookingEvidenceService(
    store.database,
    { presignDownload },
    'private-bucket',
    () => now,
  );
  return { ...store, presignDownload, service, objectKey };
}
it('CHG-008 / SEC-003: authorized evidence download returns only short-lived URL metadata', async () => {
  const store = fixture();
  store.presignDownload.mockResolvedValue('https://storage.example.test/private/download');
  await expect(store.service.download(actor, branchId, documentId)).resolves.toEqual({
    url: 'https://storage.example.test/private/download',
    expiresAt: '2026-10-15T10:01:00.000Z',
  });
  expect(store.presignDownload).toHaveBeenCalledWith(store.objectKey, fileId, 'application/pdf');
});
it('SEC-003: storage failure emits typed error without provider details', async () => {
  const store = fixture();
  store.presignDownload.mockRejectedValue(new Error('Private provider connection details'));
  await expect(store.service.download(actor, branchId, documentId)).rejects.toMatchObject({
    code: 'INTERNAL',
    message: 'Storage unavailable',
  });
});
it('SEC-003: invalid object identifiers cannot reach storage', () => {
  const store = fixture();
  expect(() => store.service.download(actor, 'invalid', documentId)).toThrow();
  expect(store.presignDownload).not.toHaveBeenCalled();
});

it('SEC-003: session expiry during signing prevents returning a signed URL', async () => {
  const store = fixture();
  store.presignDownload.mockResolvedValue('https://storage.example.test/private/download');
  vi.mocked(lockActor)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new DomainError('UNAUTHENTICATED', 401, 'Session expired'));
  await expect(store.service.download(actor, branchId, documentId)).rejects.toMatchObject({
    code: 'UNAUTHENTICATED',
  });
});
