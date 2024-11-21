import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import {
  S3Client,
  CreateBucketCommand,
  PutBucketOwnershipControlsCommand,
  PutBucketAclCommand,
} from '@aws-sdk/client-s3';
import { createDatabase, users } from '@hsm/db';
import {
  ClamScanner,
  S3Storage,
  storageConfig,
  FileScanRepository,
  FileScanService,
} from '../src/index.js';
export async function scanFixture() {
  const containers: StartedTestContainer[] = [];
  let database: ReturnType<typeof createDatabase> | undefined,
    storage: S3Storage | undefined,
    client: S3Client | undefined;
  const close = async () => {
    storage?.close();
    client?.destroy();
    await database?.close();
    for (const container of containers.reverse()) await container.stop();
  };
  try {
    const password = randomBytes(24).toString('hex');
    const postgres = await new GenericContainer('postgis/postgis:17-3.5')
      .withEnvironment({
        POSTGRES_DB: 'scan_test',
        POSTGRES_USER: 'scan_test',
        POSTGRES_PASSWORD: password,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    containers.push(postgres);
    database = createDatabase(
      'postgres://scan_test:' +
        password +
        '@' +
        postgres.getHost() +
        ':' +
        postgres.getMappedPort(5432) +
        '/scan_test',
    );
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)),
    });
    const access = randomUUID(),
      secret = randomUUID(),
      bucket = 'scan-private';
    const s3 = await new GenericContainer('versity/versitygw:v1.8.0')
      .withEnvironment({ ROOT_ACCESS_KEY: access, ROOT_SECRET_KEY: secret })
      .withCommand(['--port', ':9000', '--region', 'us-east-1', 'posix', '/data'])
      .withTmpFs({ '/data': 'rw' })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
    containers.push(s3);
    const endpoint = 'http://' + s3.getHost() + ':' + s3.getMappedPort(9000);
    client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: access, secretAccessKey: secret },
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
        S3_ACCESS_KEY_ID: access,
        S3_SECRET_ACCESS_KEY: secret,
        S3_PRIVATE_BUCKET: bucket,
      }),
    );
    const clam = await new GenericContainer('clamav/clamav:1.5.4')
      .withEnvironment({ CLAMAV_NO_FRESHCLAMD: 'true' })
      .withExposedPorts(3310)
      .withWaitStrategy(Wait.forHealthCheck())
      .withStartupTimeout(180000)
      .start();
    containers.push(clam);
    const scanner = new ClamScanner({ host: clam.getHost(), port: clam.getMappedPort(3310) });
    const repository = new FileScanRepository(database.db, bucket);
    const service = new FileScanService(repository, storage, scanner);
    const userId = randomUUID();
    await database.db.insert(users).values({ id: userId, fullName: 'Private scan fixture' });
    return { database, storage, repository, service, bucket, userId, close };
  } catch (error) {
    await close();
    throw error;
  }
}
