import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { branches, brands, organizations, residents, stays, users } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';

export const activeOfflineStay = () =>
  and(
    eq(stays.state, 'active'),
    eq(stays.source, 'manual'),
    isNotNull(stays.checkedInAt),
    isNull(stays.closedAt),
    isNull(stays.userId),
    isNull(residents.userId),
    isNull(residents.archivedAt),
  );
export async function matchingResidents(tx: Transaction, phone: string, email: string) {
  return tx
    .select({ resident: residents, stay: stays })
    .from(residents)
    .innerJoin(
      stays,
      and(eq(stays.residentId, residents.id), eq(stays.branchId, residents.branchId)),
    )
    .innerJoin(branches, eq(branches.id, residents.branchId))
    .innerJoin(brands, eq(brands.id, branches.brandId))
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(
      and(
        activeOfflineStay(),
        or(eq(residents.phone, phone), eq(residents.email, email)),
        isNull(branches.archivedAt),
        isNull(brands.archivedAt),
        isNull(organizations.archivedAt),
      ),
    )
    .limit(2);
}
export async function hasLinkedStay(tx: Transaction, userId: string, branchId: string) {
  const [current] = await tx
    .select({ id: stays.id })
    .from(stays)
    .where(
      and(
        eq(stays.userId, userId),
        or(
          eq(stays.state, 'active'),
          eq(stays.state, 'notice_given'),
          eq(stays.state, 'checkout_pending'),
        ),
      ),
    )
    .limit(1);
  const [existing] = await tx
    .select({ id: residents.id })
    .from(residents)
    .where(and(eq(residents.userId, userId), eq(residents.branchId, branchId)))
    .limit(1);
  return Boolean(current || existing);
}
export async function lockedOfflineStay(tx: Transaction, branchId: string, stayId: string) {
  const [row] = await tx
    .select({ resident: residents, stay: stays })
    .from(stays)
    .innerJoin(
      residents,
      and(eq(residents.id, stays.residentId), eq(residents.branchId, stays.branchId)),
    )
    .where(and(eq(stays.id, stayId), eq(stays.branchId, branchId), activeOfflineStay()))
    .for('update');
  return row;
}
export async function linkIdentity(tx: Transaction, userId: string) {
  const [user] = await tx
    .select({
      id: users.id,
      phone: users.phoneE164,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      status: users.accountStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
  return user;
}
