import { z } from 'zod';
import { ApiFailure, ClientFailure, RetainedCommandFailure } from '@hsm/api-client';
// Every error says what went wrong. Server details are written for people (DomainError
// messages); the API filter never sends stack traces, SQL or private data, so they are shown.
// Phone-side runtime errors are classified but their raw text is never displayed.
const fieldNames: Record<string, string> = {
  phone: 'mobile number',
  publicPhone: 'contact number',
  cnic: 'CNIC',
  fullName: 'name',
  email: 'email',
  password: 'password',
  currentPassword: 'your password',
  newPassword: 'new password',
  temporaryPassword: 'temporary password',
  age: 'age',
  gender: 'gender',
  address: 'address',
  addressLine: 'address',
  cityId: 'city',
  areaId: 'area',
  latitude: 'map pin',
  longitude: 'map pin',
  location: 'map pin',
  name: 'name',
  label: 'name or number',
  description: 'description',
  reason: 'reason',
  changeReason: 'reason',
  amountPaisa: 'amount',
  monthlyChargePaisa: 'monthly charge',
  rentPaisa: 'rent',
  depositPaisa: 'deposit',
  startsAt: 'start time',
  endsAt: 'end time',
  moveInDate: 'move-in date',
  moveOutDate: 'move-out date',
  dayOfWeek: 'day',
  meal: 'meal',
  items: 'menu',
  times: 'meal times',
  aliases: 'other names',
  fileId: 'photo',
  evidenceFileIds: 'documents',
};
// "policy.holdSeconds" -> "hold seconds"; known keys use their plain name.
export function fieldName(path: string) {
  const parts = path.split('.').filter((part) => part && !/^\d+$/.test(part));
  const last = parts.at(-1) ?? '';
  if (fieldNames[last]) return fieldNames[last];
  return last
    .replace(/Paisa$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
}
// A server detail is worth showing when it is a real sentence, not the bare code/title.
function written(error: ApiFailure) {
  const detail = error.problem.detail.trim();
  if (!detail || detail === error.problem.title || /^[A-Z_ ]+$/.test(detail)) return undefined;
  return /[.!?]$/.test(detail) ? detail : detail + '.';
}
function fields(error: ApiFailure) {
  const names = [
    ...new Set((error.problem.errors ?? []).map((item) => fieldName(item.path))),
  ].filter(Boolean);
  return names.length ? 'Check ' + names.slice(0, 4).join(', ') + '.' : undefined;
}
function apiMessage(error: ApiFailure): string {
  const detail = written(error);
  switch (error.code) {
    case 'SESSION_REVOKED':
      return 'Your session has ended. Please sign in again.';
    case 'UNAUTHENTICATED':
    case 'TOKEN_EXPIRED':
      return 'Your sign-in has expired. Please sign in again.';
    case 'FORBIDDEN':
      return detail ?? 'You do not have access to this action.';
    case 'BRANCH_FORBIDDEN':
      return 'You do not have access to this branch.';
    case 'ACCOUNT_SUSPENDED':
      return 'This account is suspended. Contact HSM support.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Verify your email before signing in.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait a minute and try again.';
    case 'IMPORT_ALREADY_COMMITTED':
      return 'This CSV content was already imported. Refresh inventory before importing another file.';
    case 'INVALID_CREDENTIALS':
      return 'Mobile number, email or password is incorrect.';
    case 'UNDERAGE':
      return 'You must be 18 or older.';
    case 'ROOT_ADMIN_LIMIT':
      return 'Only 3 Root Admins are allowed.';
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'This was already sent with different details. Refresh and try again.';
    case 'VALIDATION_FAILED':
      if (error.problem.detail === 'Choose a stronger password')
        return 'Choose a stronger password. Common ones like "password" are not allowed.';
      return detail ?? fields(error) ?? 'Some details are missing or not valid.';
    case 'NOT_FOUND':
      return detail ?? 'This item no longer exists. Go back and refresh.';
    case 'CONFLICT':
    case 'PRECONDITION_FAILED':
      return detail ?? 'This changed on another device. Refresh and try again.';
    case 'IDENTITY_EXISTS': {
      const field = error.problem.errors?.[0]?.path;
      return field === 'phone'
        ? 'This mobile number is already linked to another account. Sign in to that account or use your own unlinked mobile number.'
        : field === 'cnic'
          ? 'This CNIC is already linked to another account. Sign in to that account or contact support if this CNIC is yours.'
          : 'This mobile number or CNIC is already linked to another account. Sign in to that account or use your own unlinked details.';
    }
    case 'IDENTITY_EXISTS_CLAIM_REQUIRED':
      return detail ?? 'These details belong to an existing account. Sign in to that account.';
    case 'INTERNAL':
      return error.problem.status === 503
        ? 'The server is busy or restarting. Try again in a moment.'
        : 'Something went wrong on the server (ref ' +
            error.problem.traceId.slice(0, 8) +
            '). Try again in a moment.';
    default:
      return detail ?? 'Request failed (' + String(error.code) + ').';
  }
}
export const genericFailure = 'Something went wrong on this screen. Try again.';
export function safeMessage(error: unknown): string {
  if (error instanceof RetainedCommandFailure)
    return error.code === 'EXPIRED'
      ? 'The previous request needs reconciliation. Check its server history with support before recording another action.'
      : 'The previous request is unresolved. Retry its original details before making another change.';
  if (error instanceof ApiFailure) return apiMessage(error);
  // A form checked on the phone names the boxes to fix.
  if (error instanceof z.ZodError) {
    const names = [
      ...new Set(error.issues.map((issue) => fieldName(issue.path.map(String).join('.')))),
    ].filter(Boolean);
    return names.length
      ? 'Check ' + names.slice(0, 4).join(', ') + '.'
      : (error.issues[0]?.message ?? 'Some details are missing or not valid.');
  }
  if (error instanceof ClientFailure)
    return error.code === 'NETWORK_UNAVAILABLE'
      ? "Can't reach HSM. Check your internet connection and try again."
      : 'The server sent an unexpected reply. Try again; update the app if it keeps happening.';
  if (error instanceof Error && error.name === 'AbortError')
    return 'The server took too long to answer. Check your connection and try again.';
  // SEC-003: raw provider/runtime text can hold private paths or credentials, so it is never
  // shown; the kind of failure still is.
  if (error instanceof TypeError && /network request failed/i.test(error.message))
    return "Can't reach HSM. Check your internet connection and try again.";
  return genericFailure;
}
