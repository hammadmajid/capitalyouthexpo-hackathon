import type { Actor } from '../authorization/store.js';
import type { OtpTransaction } from './otp.store.js';
export interface EmailAssociationTransaction extends OtpTransaction {
  managerAllowed(): Promise<boolean>;
  emailAvailable(email: string): Promise<boolean>;
  bindEmail(email: string, now: Date): Promise<void>;
}
export interface EmailAssociationStore {
  transaction<T>(
    actor: Actor,
    work: (transaction: EmailAssociationTransaction) => Promise<T>,
  ): Promise<T>;
}
