import { expect, it } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { inventoryFailure } from './errors.js';
it.each(['23P01', '23505', '23514'])(
  'ACC-001: database %s conflict becomes a safe availability response',
  (code) => {
    expect(() => inventoryFailure({ code, detail: 'Private database detail' })).toThrow(
      'Inventory or booking requirements changed',
    );
    expect(() => inventoryFailure(new Error('Wrapped error', { cause: { code } }))).toThrow(
      DomainError,
    );
  },
);
it('ACC-004: foreign parent failure is hidden and unexpected errors retain diagnostics for the safe problem filter', () => {
  expect(() => inventoryFailure({ code: '23503' })).toThrow('Inventory unavailable');
  const domain = new DomainError('FORBIDDEN', 403, 'Denied');
  expect(() => inventoryFailure(domain)).toThrow(domain);
  const error = new Error('Unexpected', { cause: { code: 'XX000' } });
  expect(() => inventoryFailure(error)).toThrow(error);
  expect(() => inventoryFailure(null)).toThrow();
  expect(() => inventoryFailure(new Error('Unexpected without cause'))).toThrow();
});
