import { randomUUID } from 'node:crypto';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import {
  S3Client,
  CreateBucketCommand,
  PutBucketOwnershipControlsCommand,
  PutBucketAclCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { S3Storage, storageConfig } from '@hsm/files';
export async function objectStorageStack(containers: StartedTestContainer[], webOrigin?: string) {
  const access = randomUUID(),
    secret = randomUUID(),
    bucket = 'stack-private';
  const s3 = await new GenericContainer('versity/versitygw:v1.8.0')
    .withEnvironment({ ROOT_ACCESS_KEY: access, ROOT_SECRET_KEY: secret })
    .withCommand(['--port', ':9000', '--region', 'us-east-1', 'posix', '/data'])
    .withTmpFs({ '/data': 'rw' })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  containers.push(s3);
  const env = {
    S3_ENDPOINT: 'http://' + s3.getHost() + ':' + s3.getMappedPort(9000),
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: access,
    S3_SECRET_ACCESS_KEY: secret,
    S3_PRIVATE_BUCKET: bucket,
  };
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: access, secretAccessKey: secret },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const storage = new S3Storage(storageConfig({ APP_ENV: 'test', ...env }));
  const close = () => {
    storage.close();
    client.destroy();
  };
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    await client.send(
      new PutBucketOwnershipControlsCommand({
        Bucket: bucket,
        OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerPreferred' }] },
      }),
    );
    await client.send(new PutBucketAclCommand({ Bucket: bucket, ACL: 'private' }));
    if (webOrigin) {
      const origin = new URL(webOrigin);
      if (origin.origin !== webOrigin || !['http:', 'https:'].includes(origin.protocol))
        throw new Error('Expected an exact browser origin');
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [webOrigin],
                AllowedMethods: ['PUT'],
                AllowedHeaders: ['content-type'],
                MaxAgeSeconds: 300,
              },
            ],
          },
        }),
      );
    }
    return { env, storage, client, bucket, close };
  } catch (error) {
    close();
    throw error;
  }
}

export async function storageStack(containers: StartedTestContainer[], webOrigin?: string) {
  const s3 = await objectStorageStack(containers, webOrigin);
  try {
    const clam = await new GenericContainer('clamav/clamav:1.5.4')
      .withEnvironment({ CLAMAV_NO_FRESHCLAMD: 'true' })
      .withExposedPorts(3310)
      .withWaitStrategy(Wait.forHealthCheck())
      .withStartupTimeout(180000)
      .start();
    containers.push(clam);
    return {
      ...s3,
      env: {
        ...s3.env,
        CLAMAV_HOST: clam.getHost(),
        CLAMAV_PORT: String(clam.getMappedPort(3310)),
      },
    };
  } catch (error) {
    s3.close();
    throw error;
  }
}
