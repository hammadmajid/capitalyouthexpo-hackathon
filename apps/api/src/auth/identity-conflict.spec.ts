import { expect, it } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { identityConflictField, identityUniqueFailure } from './identity-conflict.js';
import { problem } from '../problem.js';
function unique(constraint: string) {
  return Object.assign(new Error('duplicate key'), { code: '23505', constraint_name: constraint });
}
it('AUTH-C OWN-001: maps a unique violation to the caller’s own field only', () => {
  expect(identityUniqueFailure(unique('users_phone_e164_unique'))).toBe(true);
  expect(identityConflictField(unique('users_phone_e164_unique'))).toBe('phone');
  expect(identityConflictField(unique('users_cnic_hash_unique'))).toBe('cnic');
  expect(
    identityConflictField(new Error('wrapped', { cause: unique('users_cnic_hash_unique') })),
  ).toBe('cnic');
  expect(identityConflictField(unique('users_email_unique'))).toBeUndefined();
  expect(identityConflictField('not an error')).toBeUndefined();
});
it('AUTH-C SEC-001: problem output carries only the field path, never other-account data', () => {
  const body = problem(new DomainError('IDENTITY_EXISTS', 409, 'private', 'phone'), { id: 'r1' });
  expect(body.errors).toEqual([
    { path: 'phone', code: 'identity_exists', message: 'IDENTITY EXISTS' },
  ]);
  expect(JSON.stringify(body)).not.toContain('private');
  expect(
    problem(new DomainError('IDENTITY_EXISTS', 409, 'x'), { id: 'r2' }).errors,
  ).toBeUndefined();
});
