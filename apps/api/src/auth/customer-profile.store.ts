import type { z } from 'zod';
import type { customerProfileInputSchema } from '@hsm/contracts';
import type { files, users } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
export type CustomerProfileInput = z.infer<typeof customerProfileInputSchema>;
export type CustomerIdentity = Pick<
  typeof users.$inferSelect,
  'id' | 'fullName' | 'email' | 'emailVerifiedAt' | 'passwordHash' | 'accountStatus' | 'gender'
>;
export type ProfileAttachment = Pick<typeof files.$inferSelect, 'id' | 'purpose' | 'scanStatus'>;
export interface CustomerProfileTransaction {
  readonly identity: CustomerIdentity | undefined;
  // The repository resolves only uploader-owned files in the configured private bucket.
  file(id: string): Promise<ProfileAttachment | undefined>;
  save(input: CustomerProfileInput, now: Date): Promise<void>;
}
export interface CustomerProfileStore {
  transaction<T>(
    actor: Actor,
    work: (transaction: CustomerProfileTransaction) => Promise<T>,
  ): Promise<T>;
}
