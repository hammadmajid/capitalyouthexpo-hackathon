import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { identifier, instant } from './primitives.js';
import { users } from './identity.js';
import { files } from './services.js';
import { stayAgreements } from './stay-agreements.js';
// Append-only evidence supplements an immutable original agreement; never replaces it.
export const agreementFiles = pgTable(
  'stay_agreement_files',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    label: text('label').notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.stayId, table.agreementId],
      foreignColumns: [stayAgreements.branchId, stayAgreements.stayId, stayAgreements.id],
    }),
    unique('stay_agreement_file_once_uq').on(table.fileId),
    index('stay_agreement_files_page_idx').on(
      table.branchId,
      table.stayId,
      table.agreementId,
      table.id,
    ),
    check('stay_agreement_files_label_check', sql`length(btrim(${table.label})) between 1 and 120`),
  ],
);
