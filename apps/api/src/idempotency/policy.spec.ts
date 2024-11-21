import { expect, it } from 'vitest';
import { z } from 'zod';
import { fingerprint, isExpired, requireMatchingReplay, safeResponse } from './policy.js';
it('PAY-008: canonical fingerprints bind endpoint, scope, values and array order', () => {
  const hash = fingerprint('POST /action', { branch: 'a' }, { b: 2, a: [true, null, 'name'] });
  expect(fingerprint('POST /action', { branch: 'a' }, { a: [true, null, 'name'], b: 2 })).toEqual(
    hash,
  );
  for (const value of [
    fingerprint('POST /other', { branch: 'a' }, { b: 2, a: [true, null, 'name'] }),
    fingerprint('POST /action', { branch: 'b' }, { b: 2, a: [true, null, 'name'] }),
    fingerprint('POST /action', { branch: 'a' }, { b: 2, a: [null, true, 'name'] }),
  ])
    expect(value).not.toEqual(hash);
  requireMatchingReplay({ endpoint: 'POST /action', requestHash: hash }, 'POST /action', hash);
  expect(() =>
    requireMatchingReplay({ endpoint: 'POST /other', requestHash: hash }, 'POST /action', hash),
  ).toThrow('Key already used');
  expect(() =>
    requireMatchingReplay(
      { endpoint: 'POST /action', requestHash: Buffer.alloc(32) },
      'POST /action',
      hash,
    ),
  ).toThrow('Key already used');
});
it('PAY-008: invalid, excessively nested and oversized JSON is rejected', () => {
  for (const input of [undefined, Number.NaN, Infinity, 1n, new Date(), () => true])
    expect(() => fingerprint('action', {}, input)).toThrow();
  let nested: unknown = null;
  for (let i = 0; i < 30; i++) nested = { value: nested };
  expect(() => fingerprint('action', {}, nested)).toThrow('nesting');
  expect(() => fingerprint('action', {}, 'x'.repeat(1048576))).toThrow('too large');
});
it('PAY-008: expiration has an exact 24-hour boundary', () => {
  const start = new Date('2026-10-08T00:00:00Z');
  expect(isExpired(start, new Date(start.getTime() + 86400000 - 1))).toBe(false);
  expect(isExpired(start, new Date(start.getTime() + 86400000))).toBe(true);
});
it('SEC: response snapshots validate their DTO and reject credentials and signed URLs', () => {
  const schema = z.object({ status: z.literal('suspended') }).strict();
  expect(safeResponse(schema, { status: 'suspended' })).toEqual({ status: 'suspended' });
  expect(() => safeResponse(schema, { status: 'suspended', password: 'secret' })).toThrow();
  expect(() => safeResponse(z.unknown(), { nested: { refreshToken: 'secret' } })).toThrow(
    'Sensitive',
  );
  expect(() =>
    safeResponse(z.unknown(), { url: 'https://storage.invalid/?X-Amz-Signature=secret' }),
  ).toThrow('Sensitive');
  expect(() => safeResponse(z.unknown(), 'x'.repeat(65537))).toThrow('too large');
  expect(safeResponse(z.unknown(), { values: [null, 1, false, 'safe'] })).toEqual({
    values: [null, 1, false, 'safe'],
  });
});

it('OUT-005 / PAY-008: opt-in large bounded checkout snapshots retain every privacy and size guard', () => {
  const schema = z.object({ rows: z.string() }).strict();
  const response = { rows: 'x'.repeat(80000) };
  expect(() => safeResponse(schema, response)).toThrow('too large');
  expect(safeResponse(schema, response, 262144)).toEqual(response);
  expect(() => safeResponse(z.unknown(), { rows: 'x'.repeat(262145) }, 262144)).toThrow(
    'too large',
  );
  expect(() => safeResponse(z.unknown(), { accessToken: 'private' }, 262144)).toThrow('Sensitive');
  expect(() =>
    safeResponse(z.unknown(), { url: 'https://storage.invalid/?X-Amz-Signature=private' }, 262144),
  ).toThrow('Sensitive');
});
