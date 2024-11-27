import { ApiFailure } from '@hsm/api-client';
import { safeMessage } from '../../lib/messages';
const conflicts = [
  'The platform needs at least one active Root Admin',
  'At most three Root Admins may be active',
  'Only an active admin can become Root, and at most three Root Admins exist',
  'A deactivated admin cannot be changed',
  'Root Admins hold every role; change Root membership instead',
  'That account is already an admin',
  'No change',
];
// Only known safe domain explanations; never echo arbitrary backend details.
export function adminChangeError(error: unknown) {
  if (error instanceof ApiFailure && error.code === 'CONFLICT') {
    const detail = error.problem.detail;
    return conflicts.includes(detail)
      ? detail
      : 'The account changed or this action conflicts with Admin safeguards. Review the current record before retrying.';
  }
  return safeMessage(error);
}
