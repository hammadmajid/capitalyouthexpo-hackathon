import { expect, it } from 'vitest';
import { ApiFailure } from '@hsm/api-client';
import { adminChangeError } from './change-error';
function conflict(detail: string) {
  return new ApiFailure({
    type: 'https://example.test/problem',
    title: 'Conflict',
    status: 409,
    code: 'CONFLICT',
    detail,
    traceId: 'fixture',
  });
}
it('ADM-001: known final-Root and fourth-Root conflict explanations are visible', () => {
  for (const detail of [
    'The platform needs at least one active Root Admin',
    'At most three Root Admins may be active',
  ])
    expect(adminChangeError(conflict(detail))).toBe(detail);
});
it('SEC-003: arbitrary server detail never becomes a staff-facing error', () => {
  const detail = 'Unapproved internal diagnostic';
  expect(adminChangeError(conflict(detail))).not.toContain(detail);
  expect(adminChangeError(new Error(detail))).not.toContain(detail);
});
