import type { OtpStore, OtpTransaction } from './otp.store.js';
export interface RegistrationStore extends OtpStore {
  start(
    email: string,
    now: Date,
    work: (transaction: OtpTransaction) => Promise<void>,
  ): Promise<void>;
  grant(transaction: OtpTransaction, tokenHash: string, now: Date): Promise<'password' | 'login'>;
  complete(tokenHash: string, passwordHash: string, now: Date): Promise<string>;
}
