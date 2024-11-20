import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { places } from './geography.js';
import { citext } from './primitives.js';
// Aliases attach to the existing directory identity; no second institution model.
export const placeAliases = pgTable(
  'place_aliases',
  {
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id),
    alias: citext('alias').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.placeId, table.alias] }),
    check('place_aliases_name_check', sql`length(btrim(${table.alias})) between 1 and 120`),
  ],
);
