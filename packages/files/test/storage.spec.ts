import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import {
  S3Client,
  CreateBucketCommand,
  PutBucketOwnershipControlsCommand,
  PutBucketAclCommand,
} from '@aws-sdk/client-s3';
import {
  S3Storage,
  storageConfig,
  quarantineKey,
  verifiedKey,
  validateContent,
} from '../src/index.js';
let container: StartedTestContainer, client: S3Client, storage: S3Storage, endpoint: string;
const bucket = 'hsm-private';
beforeAll(async () => {
  const accessKeyId = randomUUID(),
    secretAccessKey = randomUUID();
  container = await new GenericContainer('versity/versitygw:v1.8.0')
    .withEnvironment({ ROOT_ACCESS_KEY: accessKeyId, ROOT_SECRET_KEY: secretAccessKey })
    .withCommand(['--port', ':9000', '--region', 'us-east-1', 'posix', '/data'])
    .withTmpFs({ '/data': 'rw' })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  endpoint = 'http://' + container.getHost() + ':' + container.getMappedPort(9000);
  client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  await client.send(
    new PutBucketOwnershipControlsCommand({
      Bucket: bucket,
      OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerPreferred' }] },
    }),
  );
  await client.send(new PutBucketAclCommand({ Bucket: bucket, ACL: 'private' }));
  storage = new S3Storage(
    storageConfig({
      APP_ENV: 'test',
      S3_ENDPOINT: endpoint,
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: accessKeyId,
      S3_SECRET_ACCESS_KEY: secretAccessKey,
      S3_PRIVATE_BUCKET: bucket,
    }),
  );
});
afterAll(async () => {
  storage?.close();
  client?.destroy();
  await container?.stop();
});
it('SEC-003: real signed quarantine uploads remain private and match actual metadata', async () => {
  const id = randomUUID(),
    key = quarantineKey('payment_proof', id),
    bytes = Buffer.from('%PDF-1.7\nprivate proof fixture\n');
  const input = {
    purpose: 'payment_proof' as const,
    fileName: 'proof.pdf',
    mimeType: 'application/pdf' as const,
    sizeBytes: bytes.length,
  };
  const url = await storage.presignUpload(key, input);
  expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300');
  const uploaded = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': input.mimeType },
    body: bytes,
  });
  expect(uploaded.ok).toBe(true);
  const anonymous = await fetch(endpoint + '/' + bucket + '/' + key);
  expect(anonymous.status).toBe(403);
  expect((await fetch(endpoint + '/' + bucket)).status).toBe(403);
  const read = await storage.read(key, bytes.length);
  expect(read).toEqual(bytes);
  expect(await validateContent(input, read)).toHaveLength(32);
  await expect(storage.read(key, bytes.length - 1)).rejects.toThrow('STORAGE_UNAVAILABLE');
  await storage.remove(key);
  await expect(storage.read(key, bytes.length)).rejects.toThrow('STORAGE_UNAVAILABLE');
});
it('SEC-003: accepted snapshots cannot be overwritten through the original upload URL', async () => {
  const id = randomUUID(),
    quarantine = quarantineKey('payment_proof', id),
    verified = verifiedKey('payment_proof', id);
  const bytes = Buffer.from('%PDF-1.7\nverified snapshot\n');
  const input = {
    purpose: 'payment_proof' as const,
    fileName: 'proof.pdf',
    mimeType: 'application/pdf' as const,
    sizeBytes: bytes.length,
  };
  const url = await storage.presignUpload(quarantine, input);
  expect(
    (await fetch(url, { method: 'PUT', headers: { 'content-type': input.mimeType }, body: bytes }))
      .ok,
  ).toBe(true);
  const snapshot = await storage.read(quarantine, bytes.length);
  await validateContent(input, snapshot);
  await storage.putVerified(verified, input.mimeType, snapshot);
  expect(
    (
      await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': input.mimeType },
        body: Buffer.alloc(bytes.length, 65),
      })
    ).ok,
  ).toBe(true);
  const download = await storage.presignDownload(verified, id, input.mimeType);
  expect(new URL(download).searchParams.get('X-Amz-Expires')).toBe('60');
  const result = await fetch(download);
  expect(result.ok).toBe(true);
  expect(Buffer.from(await result.arrayBuffer())).toEqual(snapshot);
  expect((await fetch(endpoint + '/' + bucket + '/' + verified)).status).toBe(403);
  await expect(
    validateContent(input, await storage.read(quarantine, bytes.length)),
  ).rejects.toThrow('CONTENT_MISMATCH');
  await storage.remove(quarantine);
  await storage.remove(verified);
});
