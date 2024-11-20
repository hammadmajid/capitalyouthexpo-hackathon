import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { InventoryImportRow } from '@hsm/contracts';
import { branches } from './ownership.js';
import { files } from './services.js';
import { users } from './identity.js';
import { bytea, identifier, instant } from './primitives.js';
export const inventoryImportRuns = pgTable(
  'inventory_import_runs',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    kind: text('kind').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    fileSha256: bytea('file_sha256').notNull(),
    status: text('status').notNull(),
    totalRows: integer('total_rows').notNull(),
    errorRows: integer('error_rows').notNull(),
    rows: jsonb('rows').$type<InventoryImportRow[]>().notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
    committedAt: instant('committed_at'),
  },
  (table) => [
    index('inventory_import_branch_idx').on(table.branchId, table.id),
    index('inventory_import_file_idx').on(table.fileId),
    index('inventory_import_actor_idx').on(table.createdByUserId),
    uniqueIndex('inventory_import_committed_digest_uq')
      .on(table.branchId, table.kind, table.fileSha256)
      .where(sql`${table.status} = 'committed'`),
    check('inventory_import_kind_check', sql`${table.kind} in ('rooms','seats')`),
    check('inventory_import_digest_check', sql`octet_length(${table.fileSha256}) = 32`),
    check(
      'inventory_import_rows_check',
      sql`${table.totalRows} between 1 and 500 and ${table.errorRows} between 0 and ${table.totalRows} and jsonb_typeof(${table.rows}) = 'array' and jsonb_array_length(${table.rows}) = ${table.totalRows}`,
    ),
    check(
      'inventory_import_status_check',
      sql`${table.status} in ('validated','failed','committed') and (${table.status} = 'failed') = (${table.errorRows} > 0) and (${table.status} = 'committed') = (${table.committedAt} is not null)`,
    ),
  ],
);
