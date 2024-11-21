import { lockInventoryBranch, residentAccountLinks } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { AuditWriter } from '../audit/writer.js';
import type { CustomerIdentity } from './customer-profile.store.js';
import { hasLinkedStay, lockedOfflineStay, matchingResidents } from '../stay/account-link-match.js';
import { writeAccountLink } from '../stay/account-link-write.js';

function hierarchyActive(scope: Awaited<ReturnType<typeof lockInventoryBranch>>) {
  return !scope.branch.archivedAt && !scope.brand.archivedAt && !scope.organization.archivedAt;
}
async function eligibleTarget(tx: Transaction, userId: string, phone: string, email: string) {
  const matches = await matchingResidents(tx, phone, email);
  const candidate = matches.length === 1 ? matches[0] : undefined;
  if (!candidate || (await hasLinkedStay(tx, userId, candidate.stay.branchId))) return;
  const scope = await lockInventoryBranch(tx, candidate.stay.branchId);
  if (!hierarchyActive(scope)) return;
  const target = await lockedOfflineStay(tx, candidate.stay.branchId, candidate.stay.id);
  if (!target) return;
  const fresh = await matchingResidents(tx, phone, email);
  if (fresh.length !== 1 || fresh[0]?.stay.id !== target.stay.id) return;
  return { target, organizationId: scope.organization.id };
}
// RES-001 / CHG-051: only one active, checked-in offline resident may be a candidate.
export async function matchCustomerResident(
  tx: Transaction,
  identity: CustomerIdentity | undefined,
  phone: string,
  now: Date,
) {
  if (!identity?.email || !identity.emailVerifiedAt) return;
  const candidate = await eligibleTarget(tx, identity.id, phone, identity.email);
  if (!candidate) return;
  const { target, organizationId } = candidate;
  const audit = {
    actorUserId: identity.id,
    actorRole: 'self',
    organizationId,
  };
  if (target.resident.email?.toLowerCase() === identity.email.toLowerCase()) {
    await writeAccountLink(tx, target, identity.id, audit, 'email', now);
    return;
  }
  if (target.resident.phone !== phone) return;
  const [request] = await tx
    .insert(residentAccountLinks)
    .values({
      branchId: target.stay.branchId,
      stayId: target.stay.id,
      userId: identity.id,
      matchedPhone: phone,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: residentAccountLinks.id });
  if (request)
    await new AuditWriter().hostel(tx, {
      ...audit,
      branchId: target.stay.branchId,
      action: 'resident.account_link_requested',
      targetType: 'resident_account_link',
      targetId: request.id,
      after: { residentId: target.resident.id },
      createdAt: now,
    });
}
