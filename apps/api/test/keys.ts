import { randomBytes } from 'node:crypto';
export function testKeys() {
  return {
    JWT_SECRET: randomBytes(48).toString('hex'),
    CNIC_HASH_KEY: randomBytes(32).toString('hex'),
    CNIC_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
}
