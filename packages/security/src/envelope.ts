import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
export type EnvelopePurpose = 'cnic' | 'email';
export function envelopeKey(master: Buffer, purpose: EnvelopePurpose) {
  if (master.length !== 32) throw new Error('Invalid protected key');
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'hsm:' + purpose, 32));
}
export function sealEnvelope(value: string, key: Buffer, purpose: EnvelopePurpose) {
  if (key.length !== 32) throw new Error('Invalid protected key');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(Buffer.from('hsm:v1:' + purpose));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted]);
}
export function openEnvelope(envelope: Buffer, key: Buffer, purpose: EnvelopePurpose) {
  if (key.length !== 32) throw new Error('Invalid protected key');
  if (envelope.length < 29 || envelope[0] !== 1) throw new Error('Invalid protected value');
  const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(1, 13), {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from('hsm:v1:' + purpose));
  decipher.setAuthTag(envelope.subarray(13, 29));
  return Buffer.concat([decipher.update(envelope.subarray(29)), decipher.final()]).toString('utf8');
}
