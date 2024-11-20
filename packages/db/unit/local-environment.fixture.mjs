import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, hkdfSync } from 'node:crypto';
import { validate } from '../../../infra/local-env.mjs';

const api = parseEnv(readFileSync('.env.example', 'utf8'));
api.POSTGRES_PASSWORD = randomBytes(32).toString('hex');
api.DATABASE_URL = 'postgresql://hsm:' + api.POSTGRES_PASSWORD + '@localhost:5432/hsm';
for (const key of ['JWT_SECRET', 'CNIC_HASH_KEY', 'CNIC_ENCRYPTION_KEY', 'S3_SECRET_ACCESS_KEY'])
  api[key] = randomBytes(32).toString('hex');
api.S3_ACCESS_KEY_ID = randomBytes(16).toString('hex');
api.SMTP_FROM = 'hsm@example.test';
const worker = { ...api };
delete worker.CNIC_HASH_KEY;
delete worker.CNIC_ENCRYPTION_KEY;
worker.EMAIL_ENVELOPE_KEY = Buffer.from(
  hkdfSync('sha256', Buffer.from(api.CNIC_ENCRYPTION_KEY, 'hex'), Buffer.alloc(0), 'hsm:email', 32),
).toString('hex');

const checks = [
  [api, worker],
  [{ ...api, ROOT_ADMIN_EMAIL: 'root@example.test' }, worker],
  [{ ...api, JWT_SECRET: '' }, worker],
  [api, { ...worker, EMAIL_ENVELOPE_KEY: randomBytes(32).toString('hex') }],
];
for (const [input, delivery] of checks) {
  try {
    await validate(input, delivery);
    process.stdout.write('ACCEPTED\n');
  } catch {
    process.stdout.write('REJECTED\n');
  }
}
