import { randomBytes } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { expect } from 'vitest';

export const storageCredentials = {
  accessKeyId: 'hsm-development-access',
  secretAccessKey: 'hsm-development-only-secret',
};
export async function verifyPrivateStorage(endpoint: string) {
  const bucket = 'hsm-ci-private';
  const key = 'integration-' + randomBytes(8).toString('hex') + '.txt';
  const body = 'Authenticated S3 integration fixture';
  const client = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: storageCredentials,
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    expect(await object.Body?.transformToString()).toBe(body);
    const anonymousBucket = await fetch(endpoint + '/' + bucket + '/');
    expect(anonymousBucket.status).toBe(403);
    const anonymousObject = await fetch(endpoint + '/' + bucket + '/' + key);
    expect(anonymousObject.status).toBe(403);
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } finally {
    client.destroy();
  }
}
