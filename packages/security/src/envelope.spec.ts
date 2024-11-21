import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { envelopeKey, openEnvelope, sealEnvelope } from './envelope.js';
it('SEC: preserves version-one envelope format and authenticated round trips with random nonces', () => {
  const key = envelopeKey(randomBytes(32), 'email');
  const a = sealEnvelope('Protected payload', key, 'email');
  const b = sealEnvelope('Protected payload', key, 'email');
  expect(a[0]).toBe(1);
  expect(a.length).toBe(29 + Buffer.byteLength('Protected payload'));
  expect(a).not.toEqual(b);
  expect(openEnvelope(a, key, 'email')).toBe('Protected payload');
  expect(openEnvelope(sealEnvelope('', key, 'email'), key, 'email')).toBe('');
});
it('SEC: a purpose-derived worker email key cannot decrypt CNIC or a tampered envelope', () => {
  const master = randomBytes(32);
  const emailKey = envelopeKey(master, 'email');
  const cnicKey = envelopeKey(master, 'cnic');
  expect(emailKey).not.toEqual(cnicKey);
  const identity = sealEnvelope('Identity payload', cnicKey, 'cnic');
  expect(() => openEnvelope(identity, emailKey, 'cnic')).toThrow();
  expect(() => openEnvelope(identity, cnicKey, 'email')).toThrow();
  const tampered = Buffer.from(identity);
  tampered[13] = (tampered[13] ?? 0) ^ 1;
  expect(() => openEnvelope(tampered, cnicKey, 'cnic')).toThrow();
});
it('SEC: invalid keys, truncated envelopes and unsupported versions fail closed', () => {
  const key = randomBytes(32);
  expect(() => envelopeKey(Buffer.alloc(31), 'email')).toThrow('Invalid protected key');
  expect(() => sealEnvelope('value', Buffer.alloc(31), 'email')).toThrow('Invalid protected key');
  expect(() => openEnvelope(Buffer.alloc(29), Buffer.alloc(31), 'email')).toThrow(
    'Invalid protected key',
  );
  expect(() => openEnvelope(Buffer.alloc(28), key, 'email')).toThrow('Invalid protected value');
  expect(() => openEnvelope(Buffer.alloc(29), key, 'email')).toThrow('Invalid protected value');
});
