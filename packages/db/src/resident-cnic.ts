import { z } from 'zod';
// CHG-054 / CHG-004: the API encrypts a resident CNIC before it reaches the database layer.
// Only this protected form (keyed hash, sealed envelope, last 4 digits) is ever stored.
export const protectedCnicSchema = z
  .object({
    cnicHash: z.instanceof(Buffer).refine((value) => value.length === 32),
    cnicEncrypted: z.instanceof(Buffer).refine((value) => value.length > 0),
    cnicLast4: z.string().regex(/^\d{4}$/),
  })
  .strict();
export type ProtectedCnic = z.infer<typeof protectedCnicSchema>;
export function cnicColumns(cnic: ProtectedCnic | null) {
  return cnic
    ? {
        cnicHash: Buffer.from(cnic.cnicHash),
        cnicEncrypted: Buffer.from(cnic.cnicEncrypted),
        cnicLast4: cnic.cnicLast4,
      }
    : {};
}
