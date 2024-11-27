import { normalizeLoginIdentifier, pakistaniMobileSchema, passwordSchema } from '@hsm/contracts';
import { z } from 'zod';
export interface LoginInput {
  email: string;
  phone: string;
  password: string;
}
export type LoginErrors = Partial<Record<keyof LoginInput, string>>;
type Result =
  | { ok: true; values: { identifier: string; password: string } }
  | { ok: false; errors: LoginErrors };
function identifierErrors(email: string, phone: string): LoginErrors {
  if (email && phone)
    return {
      email: 'Use either email or phone number.',
      phone: 'Use either email or phone number.',
    };
  if (!email && !phone) return { email: 'Enter your email or phone number.' };
  if (email && !z.string().email().max(254).safeParse(email).success)
    return { email: 'Enter a valid email address.' };
  if (phone && !pakistaniMobileSchema.safeParse(phone).success)
    return { phone: 'Enter a valid Pakistani mobile number.' };
  return {};
}
// AUTH-C / AUTH-M-005: active UI identifier adapts to the unchanged API contract.
export function prepareLogin(input: LoginInput): Result {
  const email = input.email.trim();
  const phone = input.phone.trim();
  const errors = identifierErrors(email, phone);
  if (!passwordSchema.safeParse(input.password).success)
    errors.password = input.password
      ? 'Use a password of 8–128 characters.'
      : 'Password is required.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    values: { identifier: normalizeLoginIdentifier(email || phone), password: input.password },
  };
}
