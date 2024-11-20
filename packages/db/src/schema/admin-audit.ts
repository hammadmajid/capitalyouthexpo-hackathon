import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  foreignKey,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { organizations, branches } from './ownership.js';
import { adminStatus, adminRole } from './enums.js';
import { identifier, instant, timestamps } from './primitives.js';

export const adminAccounts = pgTable(
  'admin_accounts',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    isRoot: boolean('is_root').notNull().default(false),
    status: adminStatus('status').notNull().default('invited'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
    ...timestamps(),
  },
  (table) => [index('admin_accounts_inviter_idx').on(table.invitedByUserId)],
);
export const adminRoleGrants = pgTable(
  'admin_role_grants',
  {
    id: identifier(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminAccounts.userId),
    role: adminRole('role').notNull(),
    grantedByUserId: uuid('granted_by_user_id')
      .notNull()
      .references(() => users.id),
    grantedAt: instant('granted_at').notNull().defaultNow(),
    revokedAt: instant('revoked_at'),
  },
  (table) => [
    uniqueIndex('admin_role_grants_live_uq')
      .on(table.adminUserId, table.role)
      .where(sql`${table.revokedAt} is null`),
    index('admin_role_grants_granter_idx').on(table.grantedByUserId),
  ],
);
const auditFields = () => ({
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  before: jsonb('before').$type<Record<string, unknown>>(),
  after: jsonb('after').$type<Record<string, unknown>>(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  createdAt: instant('created_at').notNull().defaultNow(),
});
export const hostelAuditLog = pgTable(
  'hostel_audit_log',
  {
    ...auditFields(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    branchId: uuid('branch_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    uniqueIndex('hostel_audit_authorized_target_uq').on(
      table.branchId,
      table.id,
      table.actorUserId,
      table.targetId,
    ),
    index('hostel_audit_branch_idx').on(table.branchId, table.createdAt.desc()),
    index('hostel_audit_org_idx').on(table.organizationId),
    index('hostel_audit_actor_idx').on(table.actorUserId),
    index('hostel_audit_target_idx').on(table.targetType, table.targetId),
    index('hostel_audit_gallery_version_idx')
      .on(table.branchId, table.targetId, sql`(${table.before}->>'version')`)
      .where(
        sql`${table.targetType} = 'listing_media' and ${table.action} = 'listing.image.changed' and ${table.before}->>'publishedAt' is not null`,
      ),
  ],
);
export const platformAuditLog = pgTable('platform_audit_log', auditFields(), (table) => [
  index('platform_audit_actor_idx').on(table.actorUserId),
  index('platform_audit_created_idx').on(table.createdAt.desc()),
  index('platform_audit_target_idx').on(table.targetType, table.targetId),
]);
export const sensitiveAccessLog = pgTable(
  'sensitive_access_log',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    subjectUserId: uuid('subject_user_id').references(() => users.id),
    resource: text('resource').notNull(),
    resourceId: uuid('resource_id'),
    purpose: text('purpose'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('sensitive_access_actor_idx').on(table.actorUserId),
    index('sensitive_access_subject_idx').on(table.subjectUserId),
  ],
);
