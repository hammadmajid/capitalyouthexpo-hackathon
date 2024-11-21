import { eq } from 'drizzle-orm';
import { users, customerProfiles, branchSettings } from '@hsm/db';
import {
  DomainError,
  pakistaniMobileSchema,
  type CreateBookingInput,
  type BookingQuoteSnapshot,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import type { AuthCrypto } from '../auth/crypto.js';
import { requireActiveAccount } from '../auth/session.policy.js';
import { ownedProfileAttachment } from '../auth/profile-attachments.js';
import { selectEvidence, type PreparedEvidence } from './evidence-selection.js';
export async function requireBookingCustomer(database: Transaction, actor: Pick<Actor, 'userId'>) {
  const [customer] = await database
    .select({
      completedAt: customerProfiles.profileCompletedAt,
      verifiedAt: users.emailVerifiedAt,
      email: users.email,
      passwordHash: users.passwordHash,
      fullName: users.fullName,
      phone: users.phoneE164,
      gender: users.gender,
      status: users.accountStatus,
      age: customerProfiles.age,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .where(eq(customerProfiles.userId, actor.userId));
  if (customer) requireActiveAccount(customer.status);
  if (
    !customer?.completedAt ||
    !customer.verifiedAt ||
    !customer.email ||
    !customer.passwordHash ||
    customer.fullName.trim().length < 2 ||
    !customer.gender ||
    !pakistaniMobileSchema.safeParse(customer.phone).success ||
    customer.age === null ||
    customer.age < 18
  )
    throw new DomainError('FORBIDDEN', 403, 'Complete and verify Customer profile before booking');
  return customer.gender;
}
export async function requireNoUnverifiedUpfront(database: Transaction, branchId: string) {
  const [settings] = await database
    .select({ requirement: branchSettings.upfrontRequirement })
    .from(branchSettings)
    .where(eq(branchSettings.branchId, branchId));
  if (settings && settings.requirement !== 'none')
    throw new DomainError(
      'CONFLICT',
      409,
      'This booking requires financial verification outside Phase 2',
    );
}
export async function bookingEvidence(
  database: Transaction,
  actor: Actor,
  branchId: string,
  quote: BookingQuoteSnapshot,
  input: CreateBookingInput,
  bucket: string,
  crypto: Pick<AuthCrypto, 'protectCnic' | 'equals'>,
) {
  const required = quote.policy.requiredDocuments;
  if (
    input.documents.length !== required.length ||
    input.documents.some((document) => !required.includes(document.kind))
  )
    throw new DomainError(
      'VALIDATION_FAILED',
      422,
      'Provide exactly the required approved document types',
    );
  if (input.cnic && !required.includes('cnic'))
    throw new DomainError('VALIDATION_FAILED', 422, 'CNIC is not required by this booking');
  if (required.includes('cnic')) {
    const [identity] = await database
      .select({ hash: users.cnicHash, encrypted: users.cnicEncrypted })
      .from(users)
      .where(eq(users.id, actor.userId));
    if (input.cnic) {
      const protectedCnic = crypto.protectCnic(input.cnic);
      if (
        identity?.hash &&
        !crypto.equals(identity.hash.toString('hex'), protectedCnic.cnicHash.toString('hex'))
      )
        throw new DomainError('CONFLICT', 409, 'Identity correction requires review');
      await database
        .update(users)
        .set({ ...protectedCnic })
        .where(eq(users.id, actor.userId));
    } else if (!identity?.hash || !identity.encrypted)
      throw new DomainError('VALIDATION_FAILED', 422, 'Provide required private CNIC');
  }
  const evidence: PreparedEvidence[] = [];
  for (const document of input.documents) {
    const file = await ownedProfileAttachment(database, actor.userId, bucket, document.fileId);
    if (!file || file.purpose !== 'resident_document')
      throw new DomainError('NOT_FOUND', 404, 'Booking evidence unavailable');
    if (file.scanStatus !== 'clean')
      throw new DomainError('CONFLICT', 409, 'Booking evidence is not ready');
    evidence.push(await selectEvidence(database, actor, branchId, quote.policy, document));
  }
  return evidence;
}
