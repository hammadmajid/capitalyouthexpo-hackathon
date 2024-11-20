import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { identifier, instant } from './primitives.js';
import { users } from './identity.js';
import { stayAgreements } from './stay-agreements.js';
// STAY-002: append-only evidence associated with the original immutable agreement.
export const agreementAcceptances = pgTable(
  'agreement_acceptances',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    agreementVersion: integer('agreement_version').notNull(),
    acceptedByUserId: uuid('accepted_by_user_id')
      .notNull()
      .references(() => users.id),
    actorSessionId: uuid('actor_session_id').notNull(),
    acceptedAt: instant('accepted_at').notNull(),
    termsDigest: text('terms_digest').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.stayId, table.agreementId],
      foreignColumns: [stayAgreements.branchId, stayAgreements.stayId, stayAgreements.id],
    }),
    unique('agreement_acceptances_actor_uq').on(table.agreementId, table.acceptedByUserId),
    check('agreement_acceptances_version_check', sql`${table.agreementVersion} > 0`),
    check('agreement_acceptances_digest_check', sql`${table.termsDigest} ~ '^[a-f0-9]{64}$'`),
  ],
);
