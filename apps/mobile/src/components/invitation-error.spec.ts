import { expect, it } from 'vitest';
import { z } from 'zod';
import { ApiFailure } from '@hsm/api-client';
import { invitationErrorMessage } from './invitation-error';
const problem = (code: 'CONFLICT' | 'BRANCH_FORBIDDEN' | 'NOT_FOUND', detail: string) =>
  new ApiFailure({
    type: 'https://example.com/problem',
    title: 'private',
    detail,
    status: code === 'CONFLICT' ? 409 : code === 'NOT_FOUND' ? 404 : 403,
    code,
    traceId: 'private',
  });
it.each([
  [
    problem('CONFLICT', 'Identity already has a live assignment'),
    'This mobile number is already a manager or has a pending invitation.',
  ],
  [
    problem('CONFLICT', 'Invitation identity changed; retry'),
    'Their account details changed. Try again.',
  ],
  [problem('BRANCH_FORBIDDEN', 'Branch unavailable'), 'You cannot invite managers to this branch.'],
  [
    problem('NOT_FOUND', 'Invitation unavailable'),
    'This invitation is no longer available. Refresh the team list.',
  ],
])('AUTH-M-003: invite failure %# is explained plainly', (error, text) => {
  expect(invitationErrorMessage(error)).toBe(text);
});
it('AUTH-M-003: a wrong field in the form names that field', () => {
  const issues = z.object({ phone: z.string().regex(/^03/) }).safeParse({ phone: '12' });
  if (issues.success) throw Error('expected failure');
  expect(invitationErrorMessage(issues.error)).toBe('Check: mobile number (03XXXXXXXXX)');
});
