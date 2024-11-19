import { stayIdentifierSchema } from '@hsm/contracts';
import { ClientFailure } from './result.js';
// exactOptionalPropertyTypes: drop absent optional fields instead of sending undefined.
export function withoutUndefined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
export const id = (value: unknown) => stayIdentifierSchema.parse(value);
export const header = (key: string) => ({ 'Idempotency-Key': id(key) });
export function bound<T extends { branchId: string }>(result: T, branchId: string) {
  if (result.branchId !== branchId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export function ownStay<T extends { stayId: string }>(result: T, stayId: string) {
  if (result.stayId !== stayId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
