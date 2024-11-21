import { DomainError } from '@hsm/contracts';
export function inventoryFailure(error: unknown): never {
  if (error instanceof DomainError) throw error;
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : typeof cause === 'object' && cause !== null && 'code' in cause
        ? cause.code
        : undefined;
  if (code === '23P01' || code === '23505' || code === '23514')
    throw new DomainError('CONFLICT', 409, 'Inventory or booking requirements changed');
  if (code === '23503') throw new DomainError('NOT_FOUND', 404, 'Inventory unavailable');
  throw error;
}
