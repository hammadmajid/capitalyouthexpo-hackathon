import { z } from 'zod';
import { safeMessage } from './messages';
const fields: Record<string, string> = {
  phone: 'mobile number (03XXXXXXXXX)',
  tempPassword: 'temporary password (8+ characters)',
  newPassword: 'new password (8+ characters)',
  email: 'email address',
  code: 'six-digit code',
  password: 'password (8+ characters)',
};
// AUTH-C / AUTH-M-003: a form problem names the field to fix instead of a generic line.
export function authErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    const names = [...new Set(error.issues.map((issue) => fields[String(issue.path[0])]))]
      .filter(Boolean)
      .join(', ');
    return names ? 'Check: ' + names : safeMessage(error);
  }
  return safeMessage(error);
}
