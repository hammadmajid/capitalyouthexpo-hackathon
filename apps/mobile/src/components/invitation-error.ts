import { z } from 'zod';
import { ApiFailure } from '@hsm/api-client';
import { safeMessage } from '../lib/messages';
const fields: Record<string, string> = {
  fullName: 'full name',
  phone: 'mobile number (03XXXXXXXXX)',
  temporaryCredential: 'temporary password (8+ characters)',
  currentPassword: 'your password',
};
// AUTH-M-003: a failed invitation says what to fix. Only known server rules are named.
export function invitationErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    const names = [...new Set(error.issues.map((issue) => fields[String(issue.path[0])]))]
      .filter(Boolean)
      .join(', ');
    return names ? 'Check: ' + names : safeMessage(error);
  }
  if (error instanceof ApiFailure) {
    const { code, detail } = error.problem;
    if (code === 'VALIDATION_FAILED' && detail === 'Incorrect password')
      return 'Incorrect password. Try again.';
    if (code === 'CONFLICT' && /live assignment/i.test(detail))
      return 'This mobile number is already a manager or has a pending invitation.';
    if (code === 'CONFLICT' && /identity changed/i.test(detail))
      return 'Their account details changed. Try again.';
    if (code === 'BRANCH_FORBIDDEN' || code === 'FORBIDDEN')
      return 'You cannot invite managers to this branch.';
    if (code === 'NOT_FOUND' || (code === 'CONFLICT' && /invitation unavailable/i.test(detail)))
      return 'This invitation is no longer available. Refresh the team list.';
  }
  return safeMessage(error);
}
