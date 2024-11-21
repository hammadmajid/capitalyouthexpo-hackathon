import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Storage } from './storage.js';
import { quarantineKey, verifiedKey } from './keys.js';
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://storage.invalid/signed'),
}));
const config = {
  APP_ENV: 'test' as const,
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-access',
  S3_SECRET_ACCESS_KEY: 'test-only-storage-secret',
  S3_PRIVATE_BUCKET: 'private-test',
};
const fileId = randomUUID(),
  pending = quarantineKey('payment_proof', fileId),
  final = verifiedKey('payment_proof', fileId);
const upload = {
  purpose: 'payment_proof' as const,
  fileName: 'proof.pdf',
  mimeType: 'application/pdf' as const,
  sizeBytes: 4,
};
const send = vi.fn(),
  destroy = vi.fn();
const connection = { send, destroy } as unknown as S3Client;
const storage = () => new S3Storage(config, connection, connection);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSignedUrl).mockResolvedValue('https://storage.invalid/signed');
});
it('SEC-003: upload signatures enforce private quarantine and verified download signatures expire quickly', async () => {
  const value = storage();
  expect(await value.presignUpload(pending, upload)).toBe('https://storage.invalid/signed');
  const call = vi.mocked(getSignedUrl).mock.calls[0];
  expect(call?.[1]).toBeInstanceOf(PutObjectCommand);
  expect((call?.[1] as PutObjectCommand).input).toMatchObject({
    Bucket: 'private-test',
    Key: pending,
    ACL: 'private',
    ContentType: 'application/pdf',
    ContentLength: 4,
  });
  expect(call?.[2]).toMatchObject({ expiresIn: 300 });
  await value.presignDownload(final, fileId, 'application/pdf');
  const download = vi.mocked(getSignedUrl).mock.calls[1];
  expect(download?.[1]).toBeInstanceOf(GetObjectCommand);
  expect(download?.[2]).toMatchObject({ expiresIn: 60 });
  expect((download?.[1] as GetObjectCommand).input.ResponseContentDisposition).toContain(
    'attachment;',
  );
  await expect(value.presignUpload(final, upload)).rejects.toThrow('quarantine');
  await expect(value.presignDownload(pending, fileId, 'application/pdf')).rejects.toThrow(
    'Verified',
  );
  vi.mocked(getSignedUrl).mockRejectedValue(new Error('Provider secret must not escape'));
  await expect(value.presignUpload(pending, upload)).rejects.toThrow('STORAGE_UNAVAILABLE');
  await expect(value.presignDownload(final, fileId, 'application/pdf')).rejects.toThrow(
    'STORAGE_UNAVAILABLE',
  );
});
it('SEC: object reads are bounded even when the provider omits or spoofs length metadata', async () => {
  send.mockResolvedValueOnce({
    Body: Readable.from([Buffer.from('ab'), Buffer.from('cd')]),
    ContentLength: 4,
  });
  expect(await storage().read(pending, 4)).toEqual(Buffer.from('abcd'));
  send.mockResolvedValueOnce({ Body: Readable.from([Buffer.from('ab')]) });
  expect(await storage().read(pending, 2)).toEqual(Buffer.from('ab'));
  const oversized = Readable.from([Buffer.from('abc')]);
  send.mockResolvedValueOnce({ Body: oversized, ContentLength: 3 });
  await expect(storage().read(pending, 2)).rejects.toThrow('STORAGE_UNAVAILABLE');
  expect(oversized.destroyed).toBe(true);
  send.mockResolvedValueOnce({ Body: Readable.from([Buffer.from('abc')]) });
  await expect(storage().read(pending, 2)).rejects.toThrow('STORAGE_UNAVAILABLE');
  send.mockResolvedValueOnce({ Body: Readable.from(['not binary']) });
  await expect(storage().read(pending, 20)).rejects.toThrow('STORAGE_UNAVAILABLE');
  send.mockResolvedValueOnce({});
  await expect(storage().read(pending, 4)).rejects.toThrow('STORAGE_UNAVAILABLE');
  send.mockRejectedValueOnce(new Error('Private provider details'));
  await expect(storage().read(pending, 4)).rejects.toThrow('STORAGE_UNAVAILABLE');
});
it('SEC-003: verified writes and cleanup retain private ACL and sanitize provider failures', async () => {
  send.mockResolvedValue({});
  const value = storage();
  await value.putVerified(final, 'application/pdf', Buffer.from('safe'));
  const write = send.mock.calls[0]?.[0] as PutObjectCommand;
  expect(write).toBeInstanceOf(PutObjectCommand);
  expect(write.input).toMatchObject({ Key: final, ACL: 'private', ContentLength: 4 });
  await value.remove(pending);
  expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  await expect(value.putVerified(pending, 'application/pdf', Buffer.from('safe'))).rejects.toThrow(
    'Verified',
  );
  send.mockRejectedValue(new Error('Private provider details'));
  await expect(value.putVerified(final, 'application/pdf', Buffer.from('safe'))).rejects.toThrow(
    'STORAGE_UNAVAILABLE',
  );
  await expect(value.remove(pending)).rejects.toThrow('STORAGE_UNAVAILABLE');
  value.close();
  expect(destroy).toHaveBeenCalledTimes(2);
  const actual = new S3Storage(config);
  actual.close();
  new S3Storage({ ...config, S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:9000' }).close();
});

it.each(['header', 'stream'] as const)(
  'SEC-003: %s byte overflow is a typed size violation while provider details remain hidden',
  async (source) => {
    const body = Readable.from([Buffer.from('abc')]);
    send.mockResolvedValueOnce({ Body: body, ContentLength: source === 'header' ? 3 : undefined });
    await expect(storage().read(pending, 2)).rejects.toMatchObject({ code: 'SIZE_MISMATCH' });
    expect(body.destroyed).toBe(true);
  },
);
