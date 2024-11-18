import { randomBytes, hkdfSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (name) => parseEnv(readFileSync(new URL(name, root), 'utf8'));
const secret = () => randomBytes(32).toString('hex');
const emailKey = (master) =>
  Buffer.from(
    hkdfSync('sha256', Buffer.from(master, 'hex'), Buffer.alloc(0), 'hsm:email', 32),
  ).toString('hex');

function fill(name, values) {
  const path = new URL(name, root);
  let content = readFileSync(path, 'utf8');
  const current = parseEnv(content);
  for (const [key, value] of Object.entries(values)) {
    if (current[key]) continue;
    const pattern = new RegExp('^' + key + '=.*$', 'gm');
    content = pattern.test(content)
      ? content.replace(pattern, () => key + '=' + value)
      : content.trimEnd() + '\n' + key + '=' + value + '\n';
  }
  writeFileSync(path, content, { mode: 0o600 });
}

function provision() {
  const api = read('.env');
  if (api.APP_ENV !== 'development') throw new Error('Development environment required');
  const password = api.POSTGRES_PASSWORD || secret();
  fill('.env', {
    POSTGRES_PASSWORD: password,
    DATABASE_URL:
      'postgresql://' +
      encodeURIComponent(api.POSTGRES_USER) +
      ':' +
      encodeURIComponent(password) +
      '@localhost:' +
      (api.POSTGRES_PORT || '5432') +
      '/' +
      encodeURIComponent(api.POSTGRES_DB),
    JWT_SECRET: secret(),
    CNIC_HASH_KEY: secret(),
    CNIC_ENCRYPTION_KEY: secret(),
    S3_ACCESS_KEY_ID: randomBytes(16).toString('hex'),
    S3_SECRET_ACCESS_KEY: secret(),
    SMTP_FROM: 'hsm@hsm.localhost',
    ROOT_ADMIN_EMAIL: 'admin@hsm.localhost',
    ROOT_ADMIN_PASSWORD: secret(),
  });
  const updated = read('.env');
  const shared = [
    'DATABASE_URL',
    'REDIS_URL',
    'APP_ENV',
    'NODE_ENV',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_PRIVATE_BUCKET',
    'CLAMAV_HOST',
    'CLAMAV_PORT',
    'VISITS_ENABLED',
  ];
  fill('.env.worker', {
    ...Object.fromEntries(shared.map((key) => [key, updated[key] || ''])),
    EMAIL_ENVELOPE_KEY: emailKey(updated.CNIC_ENCRYPTION_KEY),
  });
  process.stdout.write('Empty local credentials configured; existing nonempty values preserved.\n');
}

export async function validate(api = read('.env'), worker = read('.env.worker')) {
  const { parseEnvironment } = await import('../apps/api/dist/config.js');
  const { workerConfig } = await import('../apps/worker/dist/config.js');
  const { storageConfig } = await import('../packages/files/dist/config.js');
  const { seedEnvironmentSchema } = await import('../packages/db/dist/seed.js');
  const { webConfig, privateUploadOrigin } = await import('../apps/web/src/server/config.ts');
  const { validateMobileConfig } = await import('../apps/mobile/src/lib/config.ts');
  parseEnvironment(api);
  workerConfig(worker);
  storageConfig(api);
  storageConfig(worker);
  // ADM-002: startup never seeds; bootstrap credentials are needed only for db:seed.
  if (api.ROOT_ADMIN_EMAIL || api.ROOT_ADMIN_PASSWORD) seedEnvironmentSchema.parse(api);
  webConfig(api);
  privateUploadOrigin(api.WEB_UPLOAD_ORIGIN, api.APP_ENV);
  validateMobileConfig({ environment: api.EXPO_PUBLIC_APP_ENV, apiUrl: api.EXPO_PUBLIC_API_URL });
  const url = new URL(api.DATABASE_URL);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    decodeURIComponent(url.username) !== api.POSTGRES_USER ||
    decodeURIComponent(url.password) !== api.POSTGRES_PASSWORD ||
    decodeURIComponent(url.pathname.slice(1)) !== api.POSTGRES_DB ||
    url.port !== (api.POSTGRES_PORT || '5432')
  )
    throw new Error('Local database settings mismatch');
  const shared = [
    'DATABASE_URL',
    'REDIS_URL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_FROM',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_PRIVATE_BUCKET',
    'CLAMAV_HOST',
    'CLAMAV_PORT',
    'APP_ENV',
    'VISITS_ENABLED',
  ];
  for (const key of shared)
    if ((api[key] || '') !== (worker[key] || '')) throw new Error('API/worker mismatch: ' + key);
  const expected = Buffer.from(emailKey(api.CNIC_ENCRYPTION_KEY), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(worker.EMAIL_ENVELOPE_KEY, 'hex')))
    throw new Error('Worker email envelope key mismatch');
  if (api.CNIC_ENCRYPTION_KEY === api.CNIC_HASH_KEY || api.JWT_SECRET === api.CNIC_HASH_KEY)
    throw new Error('Independent master secrets required');
  process.stdout.write(
    'API, worker, storage, web and mobile schemas valid; shared settings match.\n',
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  try {
    if (process.argv[2] === 'provision') provision();
    else await validate();
  } catch (error) {
    const issues = error?.issues?.map((issue) => issue.path.join('.')).join(', ');
    process.stderr.write(
      'Local environment check failed: ' +
        (issues || error?.code || 'configuration mismatch') +
        '\n',
    );
    process.exitCode = 1;
  }
