import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './ownership.js';
import { identifier, instant, timestamps } from './primitives.js';

// PROP / RPT-001: authoritative physical hierarchy, shared by management and
// report predicates. Referenced rows are archived, never deleted or fabricated.
export const buildings = pgTable(
  'buildings',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    unique('buildings_branch_id_uq').on(table.branchId, table.id),
    check('buildings_name_check', sql`length(btrim(${table.name})) between 1 and 120`),
    check('buildings_version_check', sql`${table.version} > 0`),
    index('buildings_branch_page_idx').on(table.branchId, table.id),
  ],
);

export const floors = pgTable(
  'floors',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    buildingId: uuid('building_id').notNull(),
    label: text('label').notNull(),
    levelNumber: smallint('level_number').notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    unique('floors_branch_id_uq').on(table.branchId, table.id),
    foreignKey({
      columns: [table.branchId, table.buildingId],
      foreignColumns: [buildings.branchId, buildings.id],
    }),
    check('floors_label_check', sql`length(btrim(${table.label})) between 1 and 120`),
    check('floors_version_check', sql`${table.version} > 0`),
    index('floors_building_page_idx').on(table.branchId, table.buildingId, table.id),
  ],
);
