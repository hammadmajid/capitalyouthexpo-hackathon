import { and, eq, exists, gte, notExists, sql, type SQL } from 'drizzle-orm';
import {
  brands,
  branches,
  bookings,
  complaints,
  managerAssignments,
  organizations,
  ownerProfiles,
  residentPayments,
  residentReceipts,
  residentPaymentReversals,
  stayAssignments,
  users,
} from '@hsm/db';
import type { AdminExplorerKind } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';

const empty = {
  parentId: sql<string | null>`null::uuid`.as('parent_id'),
  parentName: sql<string | null>`null::text`.as('parent_name'),
  quantity: sql<number | null>`null::int`.as('quantity'),
  amountPaisa: sql<string | null>`null::text`.as('amount_paisa'),
  reason: sql<string | null>`null::text`.as('reason'),
};
export function explorerSource(tx: Transaction, kind: AdminExplorerKind, now: Date, since?: Date) {
  if (kind === 'users' || kind === 'owners' || kind === 'managers') {
    const membership =
      kind === 'owners'
        ? exists(
            tx
              .select({ id: ownerProfiles.userId })
              .from(ownerProfiles)
              .where(eq(ownerProfiles.userId, users.id)),
          )
        : kind === 'managers'
          ? exists(
              tx
                .select({ id: managerAssignments.id })
                .from(managerAssignments)
                .where(eq(managerAssignments.userId, users.id)),
            )
          : undefined;
    return tx
      .select({
        ...empty,
        id: users.id,
        name: users.fullName,
        status: (kind === 'managers'
          ? sql<string>`coalesce((select ${managerAssignments.status}::text from ${managerAssignments} where ${managerAssignments.userId} = ${users.id} order by case when ${managerAssignments.status} <> 'deactivated' then 0 else 1 end, ${managerAssignments.createdAt} desc, ${managerAssignments.id} desc limit 1), 'deactivated')`
          : sql<string>`${users.accountStatus}::text`
        ).as('status'),
        createdAt: users.createdAt,
      })
      .from(users)
      .where(membership)
      .as('explorer');
  }
  if (kind === 'hostels')
    return tx
      .select({
        ...empty,
        id: brands.id,
        name: brands.name,
        status:
          sql<string>`case when ${brands.archivedAt} is null and ${organizations.archivedAt} is null then 'active' else 'archived' end`.as(
            'status',
          ),
        createdAt: brands.createdAt,
        parentId: sql<string>`${brands.organizationId}`.as('parent_id'),
        parentName: sql<string>`${organizations.name}`.as('parent_name'),
      })
      .from(brands)
      .innerJoin(organizations, eq(organizations.id, brands.organizationId))
      .as('explorer');
  if (kind === 'branches' || kind === 'occupancy')
    return tx
      .select({
        ...empty,
        id: branches.id,
        name: branches.name,
        status:
          sql<string>`case when ${branches.archivedAt} is not null or ${brands.archivedAt} is not null or ${organizations.archivedAt} is not null then 'archived' else ${branches.verificationStatus}::text end`.as(
            'status',
          ),
        createdAt: branches.createdAt,
        parentId: sql<string>`${branches.brandId}`.as('parent_id'),
        parentName: sql<string>`${brands.name}`.as('parent_name'),
        ...(kind === 'occupancy'
          ? {
              quantity:
                sql<number>`(select count(*)::int from ${stayAssignments} where ${stayAssignments.branchId} = ${branches.id} and ${stayAssignments.endedAt} is null and ${stayAssignments.startedAt} <= ${now.toISOString()}::timestamptz)`.as(
                  'quantity',
                ),
            }
          : {}),
      })
      .from(branches)
      .innerJoin(brands, eq(brands.id, branches.brandId))
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .as('explorer');
  if (kind === 'payments')
    return tx
      .select({
        ...empty,
        id: branches.id,
        name: branches.name,
        status: sql<string>`'approved'`.as('status'),
        createdAt: sql<Date>`max(${residentPayments.approvedAt})`
          .mapWith(residentPayments.approvedAt)
          .as('created_at'),
        parentId: sql<string>`${branches.brandId}`.as('parent_id'),
        parentName: sql<string>`${brands.name}`.as('parent_name'),
        quantity: sql<number>`count(*)::int`.as('quantity'),
        amountPaisa: sql<string>`sum(${residentPayments.amountPaisa})::text`.as('amount_paisa'),
        reason:
          sql<string>`'Approved payments made directly to the hostel; not platform income'`.as(
            'reason',
          ),
      })
      .from(residentPayments)
      .innerJoin(residentReceipts, eq(residentReceipts.paymentId, residentPayments.id))
      .innerJoin(branches, eq(branches.id, residentPayments.branchId))
      .innerJoin(brands, eq(brands.id, branches.brandId))
      .where(
        and(
          since ? gte(residentPayments.approvedAt, since) : undefined,
          notExists(
            tx
              .select({ id: residentPaymentReversals.id })
              .from(residentPaymentReversals)
              .where(eq(residentPaymentReversals.paymentId, residentPayments.id)),
          ),
        ),
      )
      .groupBy(branches.id, brands.name)
      .as('explorer');
  if (kind === 'bookings')
    return tx
      .select({
        ...empty,
        id: bookings.id,
        name: sql<string>`${branches.name} || ' · ' || left(${bookings.id}::text, 8)`.as('name'),
        status: sql<string>`${bookings.state}::text`.as('status'),
        createdAt: bookings.createdAt,
        parentId: sql<string>`${branches.id}`.as('parent_id'),
        parentName: sql<string>`${branches.name}`.as('parent_name'),
        reason: sql<string>`'Booking lifecycle is managed by authorized branch staff'`.as('reason'),
      })
      .from(bookings)
      .innerJoin(branches, eq(branches.id, bookings.branchId))
      .as('explorer');
  return tx
    .select({
      ...empty,
      id: complaints.id,
      name: sql<string>`${branches.name} || ' · ' || ${complaints.category}::text`.as('name'),
      status: sql<string>`${complaints.status}::text`.as('status'),
      createdAt: complaints.createdAt,
      parentId: sql<string>`${branches.id}`.as('parent_id'),
      parentName: sql<string>`${branches.name}`.as('parent_name'),
      reason: sql<string>`${complaints.category}::text`.as('reason'),
    })
    .from(complaints)
    .innerJoin(branches, eq(branches.id, complaints.branchId))
    .as('explorer');
}

export function explorerRelations(
  tx: Transaction,
  kind: AdminExplorerKind,
  id: SQL,
  ownerId?: string,
  managerId?: string,
) {
  const branchScope = and(
    ownerId ? eq(organizations.ownerUserId, ownerId) : undefined,
    managerId
      ? exists(
          tx
            .select({ id: managerAssignments.id })
            .from(managerAssignments)
            .where(
              and(
                eq(managerAssignments.branchId, branches.id),
                eq(managerAssignments.userId, managerId),
              ),
            ),
        )
      : undefined,
  );
  if (!ownerId && !managerId) return undefined;
  if (kind === 'hostels')
    return exists(
      tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, sql`${id}`),
            ownerId ? eq(organizations.ownerUserId, ownerId) : undefined,
          ),
        ),
    );
  if (kind === 'branches' || kind === 'occupancy' || kind === 'payments')
    return exists(
      tx
        .select({ id: branches.id })
        .from(branches)
        .innerJoin(organizations, eq(organizations.id, branches.organizationId))
        .where(and(eq(branches.id, id), branchScope)),
    );
  return undefined;
}
