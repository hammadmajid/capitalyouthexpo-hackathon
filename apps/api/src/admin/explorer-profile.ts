import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  adminAccounts,
  branches,
  brands,
  customerProfiles,
  managerAssignments,
  organizations,
  ownerProfiles,
  staffMembers,
  users,
} from '@hsm/db';
import { adminExplorerDetailSchema, type AdminExplorerKind } from '@hsm/contracts';
import type { z } from 'zod';
import type { Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
type Detail = z.infer<typeof adminExplorerDetailSchema>;
type Profile = Pick<Detail, 'facts' | 'links' | 'action'>;
// CHG-039: Admin sees only how many active staff a branch or hostel has; never names,
// phones, salaries, payments or agreements. Each staff row belongs to one branch.
async function activeStaff(tx: Transaction, where: { branchId?: string; brandId?: string }) {
  const [row] = await tx
    .select({ value: sql<number>`count(${staffMembers.id})::int` })
    .from(staffMembers)
    .innerJoin(branches, eq(branches.id, staffMembers.branchId))
    .where(
      and(
        eq(staffMembers.status, 'active'),
        isNull(staffMembers.archivedAt),
        where.branchId ? eq(staffMembers.branchId, where.branchId) : undefined,
        where.brandId ? eq(branches.brandId, where.brandId) : undefined,
      ),
    );
  return String(row?.value ?? 0);
}

export async function explorerProfile(
  tx: Transaction,
  actor: Actor,
  kind: AdminExplorerKind,
  id: string,
  parentId: string | null,
): Promise<Profile> {
  const result: Profile = { facts: [], links: [], action: 'none' };
  if (kind === 'users' || kind === 'owners' || kind === 'managers') {
    const [user] = await tx
      .select({
        status: users.accountStatus,
        verified: sql<boolean>`${users.emailVerifiedAt} is not null`,
      })
      .from(users)
      .where(eq(users.id, id));
    const [owner] = await tx
      .select({ id: ownerProfiles.userId })
      .from(ownerProfiles)
      .where(eq(ownerProfiles.userId, id))
      .limit(1);
    const [business] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.ownerUserId, id))
      .limit(1);
    const [manager] = await tx
      .select({ id: managerAssignments.id })
      .from(managerAssignments)
      .where(eq(managerAssignments.userId, id))
      .limit(1);
    const [activeManager] = await tx
      .select({ id: managerAssignments.id })
      .from(managerAssignments)
      .where(and(eq(managerAssignments.userId, id), eq(managerAssignments.status, 'active')))
      .limit(1);
    const [admin] = await tx
      .select({ id: adminAccounts.userId })
      .from(adminAccounts)
      .where(eq(adminAccounts.userId, id))
      .limit(1);
    const [customer] = await tx
      .select({ id: customerProfiles.userId })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, id))
      .limit(1);
    result.facts.push(
      { label: 'Account status', value: user?.status ?? 'Unavailable' },
      { label: 'Email verified', value: user?.verified ? 'Yes' : 'No' },
      { label: 'Customer profile', value: customer ? 'Present' : 'Not completed' },
      { label: 'Owner profile', value: owner ? 'Present' : 'Not completed' },
      { label: 'Manager assignments', value: manager ? 'Present' : 'None' },
      { label: 'Admin membership', value: admin ? 'Protected' : 'None' },
    );
    if (kind !== 'users') result.links.push({ label: 'Account profile', kind: 'users', id });
    if (owner || business)
      result.links.push(
        { label: 'Owned hostel businesses', kind: 'hostels', ownerId: id },
        { label: 'Owned branches', kind: 'branches', ownerId: id },
      );
    if (manager)
      result.links.push({
        label: 'Assigned branches and history',
        kind: 'branches',
        managerId: id,
      });
    if (
      customer &&
      !admin &&
      !owner &&
      !business &&
      !activeManager &&
      actor.userId !== id &&
      ['active', 'suspended', 'banned'].includes(user?.status ?? '')
    )
      result.action = 'customer_governance';
    return result;
  }
  if (kind === 'hostels' && parentId) {
    const [organization] = await tx
      .select({ name: organizations.name, ownerId: organizations.ownerUserId })
      .from(organizations)
      .where(eq(organizations.id, parentId));
    if (organization) {
      result.facts.push({ label: 'Organization', value: organization.name });
      result.links.push({ label: 'Owner account', kind: 'users', id: organization.ownerId });
    }
    result.facts.push({ label: 'Staff', value: await activeStaff(tx, { brandId: id }) });
    result.links.push({ label: 'All branches of this hostel', kind: 'branches', parentId: id });
    return result;
  }
  if (['branches', 'occupancy', 'payments'].includes(kind)) {
    const [branch] = await tx
      .select({
        brandId: branches.brandId,
        brandName: brands.name,
        ownerId: organizations.ownerUserId,
        organizationName: organizations.name,
        verified: branches.verificationStatus,
        archived: branches.archivedAt,
      })
      .from(branches)
      .innerJoin(brands, eq(brands.id, branches.brandId))
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(eq(branches.id, id));
    if (branch) {
      result.facts.push(
        { label: 'Hostel business', value: branch.brandName },
        { label: 'Organization', value: branch.organizationName },
        { label: 'Verification', value: branch.verified },
      );
      if (kind === 'branches')
        result.facts.push({ label: 'Staff', value: await activeStaff(tx, { branchId: id }) });
      result.links.push(
        { label: 'Hostel business', kind: 'hostels', id: branch.brandId },
        { label: 'Owner account', kind: 'users', id: branch.ownerId },
      );
      if (kind === 'branches') {
        result.links.push(
          { label: 'Branch bookings', kind: 'bookings', parentId: id },
          { label: 'Branch complaint categories', kind: 'complaints', parentId: id },
          { label: 'Current occupancy aggregate', kind: 'occupancy', id },
          { label: 'Approved payment aggregate', kind: 'payments', id },
        );
        if (!branch.archived) result.action = 'verification';
      } else result.links.push({ label: 'Branch profile', kind: 'branches', id });
    }
    return result;
  }
  if (parentId) result.links.push({ label: 'Branch profile', kind: 'branches', id: parentId });
  result.facts.push(
    { label: 'Priority', value: 'Not recorded by this workflow' },
    {
      label: 'Administrative scope',
      value: 'Read-only lifecycle metadata; branch staff own decisions',
    },
  );
  return result;
}
