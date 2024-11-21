import type { z } from 'zod';
import type { ownerProfileInputSchema } from '@hsm/contracts';
import type { users } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import type { AuthCrypto } from './crypto.js';
import type { ProfileIdentity } from './profile-identity.policy.js';
import type { ProfileAttachment } from './customer-profile.store.js';
export type OwnerProfileInput = z.infer<typeof ownerProfileInputSchema>;
export type OwnerProfilePersistence = Omit<OwnerProfileInput, 'cnic'>;
export type OwnerIdentity = ProfileIdentity &
  Pick<typeof users.$inferSelect, 'cnicHash' | 'phoneE164'>;
export type ProtectedOwnerCnic = ReturnType<AuthCrypto['protectCnic']>;
export interface OwnerProfileTransaction {
  readonly identity: OwnerIdentity | undefined;
  file(id: string): Promise<ProfileAttachment | undefined>;
  save(input: OwnerProfilePersistence, protectedCnic: ProtectedOwnerCnic, now: Date): Promise<void>;
}
export interface OwnerProfileStore {
  transaction<T>(
    actor: Actor,
    work: (transaction: OwnerProfileTransaction) => Promise<T>,
  ): Promise<T>;
}
