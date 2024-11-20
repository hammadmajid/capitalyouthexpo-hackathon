import { expect } from 'vitest';
// Assert the actual guard, rather than passing on an unrelated deferred-commit failure.
export async function expectBillingGuard(
  work: PromiseLike<unknown>,
  message: string,
  code = '23514',
) {
  const result = Promise.resolve(work).catch((error: unknown) => {
    throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
  });
  await expect(result).rejects.toMatchObject({ code, message });
}

export async function expectBillingForeignKey(work: PromiseLike<unknown>, constraint: string) {
  const result = Promise.resolve(work).catch((error: unknown) => {
    throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
  });
  await expect(result).rejects.toMatchObject({ code: '23503', constraint_name: constraint });
}
