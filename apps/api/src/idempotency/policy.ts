import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '@hsm/contracts';
function canonical(value: unknown, depth = 0): string {
  if (depth > 24) throw new DomainError('VALIDATION_FAILED', 400, 'JSON nesting too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value))
    return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
  if (
    !value ||
    typeof value !== 'object' ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new DomainError('VALIDATION_FAILED', 400, 'JSON value required');
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonical(Reflect.get(value, key), depth + 1))
      .join(',') +
    '}'
  );
}
export function fingerprint(endpoint: string, scope: unknown, body: unknown) {
  const encoded = canonical({ endpoint, scope, body });
  if (Buffer.byteLength(encoded) > 1048576)
    throw new DomainError('VALIDATION_FAILED', 400, 'Request too large');
  return createHash('sha256').update(encoded).digest();
}
export function requireMatchingReplay(
  row: { endpoint: string; requestHash: Buffer },
  endpoint: string,
  requestHash: Buffer,
) {
  if (row.endpoint !== endpoint || !row.requestHash.equals(requestHash))
    throw new DomainError(
      'IDEMPOTENCY_KEY_REUSED',
      409,
      'Key already used for a different request',
    );
}
export function isExpired(createdAt: Date, now: Date) {
  return createdAt.getTime() + 86400000 <= now.getTime();
}
const privateField =
  /password|token|otp|cnic|permanent.?address|guardian|authorization|cookie|secret/i;
export function safeResponse<T>(
  schema: z.ZodType<T>,
  input: unknown,
  maximumBytes: 65536 | 262144 = 65536,
): T {
  z.union([z.literal(65536), z.literal(262144)]).parse(maximumBytes);
  const value = schema.parse(input);
  const encoded = canonical(value);
  // Opt-in handlers must project stable public DTOs, never credentials or signed URLs.
  const inspect = (node: unknown): void => {
    if (typeof node === 'string' && /X-Amz-(Signature|Credential)=/i.test(node))
      throw new Error('Sensitive response cannot be cached');
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (privateField.test(key)) throw new Error('Sensitive response cannot be cached');
        inspect(Reflect.get(node, key));
      }
    }
  };
  inspect(value);
  if (Buffer.byteLength(encoded) > maximumBytes) throw new Error('Cached response too large');
  return value;
}
