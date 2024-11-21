import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { uploadPurposeSchema } from '@hsm/contracts';
const identifier = z.string().uuid();
export function quarantineKey(purpose: z.infer<typeof uploadPurposeSchema>, fileId: string) {
  return 'quarantine/' + uploadPurposeSchema.parse(purpose) + '/' + identifier.parse(fileId);
}
export function verifiedKey(purpose: z.infer<typeof uploadPurposeSchema>, fileId: string) {
  return (
    'private/' +
    uploadPurposeSchema.parse(purpose) +
    '/' +
    identifier.parse(fileId) +
    '/' +
    randomUUID()
  );
}
export const storageKey = z
  .string()
  .max(300)
  .regex(/^(quarantine|private)\/[a-z_]+\/[a-f0-9-]{36}(\/[a-f0-9-]{36})?$/);
