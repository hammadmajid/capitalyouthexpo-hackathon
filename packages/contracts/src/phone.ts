import { z } from 'zod';
// CHG-006: formatting is not phone ownership verification.
export const pakistaniMobileSchema = z
  .string()
  .trim()
  .max(13)
  .regex(/^(?:0|\+92|92)3\d{9}$/)
  .transform((value) =>
    value.startsWith('0') ? '+92' + value.slice(1) : value.startsWith('+') ? value : '+' + value,
  );
export function normalizeLoginIdentifier(input: unknown): string {
  const identifier = z.string().trim().min(3).max(254).parse(input);
  const phone = pakistaniMobileSchema.safeParse(identifier);
  if (phone.success) return phone.data;
  return z.string().email().max(254).parse(identifier).toLowerCase();
}
// TRUST-006: one public-contact form everywhere (E.164, as the listing requires). Local
// Pakistani numbers ("0315…", "051-…") gain +92; "00…" becomes "+…". Null when unusable.
export function contactPhoneE164(input: string): string | null {
  const value = input.trim(),
    digits = value.replace(/\D/g, '');
  const e164 = value.startsWith('+')
    ? '+' + digits
    : digits.startsWith('00')
      ? '+' + digits.slice(2)
      : digits.startsWith('0')
        ? '+92' + digits.slice(1)
        : digits.startsWith('92') && digits.length >= 11
          ? '+' + digits
          : /^3\d{9}$/.test(digits)
            ? '+92' + digits
            : '';
  return /^\+[1-9][0-9]{6,14}$/.test(e164) ? e164 : null;
}
