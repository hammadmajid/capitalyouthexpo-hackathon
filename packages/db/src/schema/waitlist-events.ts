import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { identifier, instant } from './primitives.js';
import { branches } from './ownership.js';
import { roomTypes } from './inventory.js';
import { waitlistEntries } from './waitlist.js';
export const waitlistVacancyEvents = pgTable(
  'waitlist_vacancy_events',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomTypeId: uuid('room_type_id'),
    branchBecameAvailable: boolean('branch_became_available').notNull(),
    typeBecameAvailable: boolean('type_became_available').notNull(),
    availableOn: date('available_on').notNull(),
    createdAt: instant('created_at').notNull(),
  },
  (table) => [
    unique('waitlist_vacancy_event_branch_uq').on(table.branchId, table.id),
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
    check(
      'waitlist_vacancy_transition_check',
      sql`${table.branchBecameAvailable} or ${table.typeBecameAvailable}`,
    ),
    check(
      'waitlist_vacancy_preference_check',
      sql`not ${table.typeBecameAvailable} or ${table.roomTypeId} is not null`,
    ),
    index('waitlist_vacancy_type_idx').on(table.branchId, table.roomTypeId, table.id),
  ],
);
// Notification edge detection only. Never use this observation to approve a booking or publish availability counts.
export const waitlistAvailability = pgTable(
  'waitlist_availability',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomTypeId: uuid('room_type_id'),
    available: boolean('available').notNull(),
    eventId: uuid('event_id'),
    checkedAt: instant('checked_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
    foreignKey({
      columns: [table.branchId, table.eventId],
      foreignColumns: [waitlistVacancyEvents.branchId, waitlistVacancyEvents.id],
    }),
    uniqueIndex('waitlist_availability_branch_uq')
      .on(table.branchId)
      .where(sql`${table.roomTypeId} is null`),
    uniqueIndex('waitlist_availability_type_uq')
      .on(table.branchId, table.roomTypeId)
      .where(sql`${table.roomTypeId} is not null`),
    check('waitlist_availability_event_check', sql`${table.eventId} is null or ${table.available}`),
    index('waitlist_availability_event_idx').on(table.eventId),
  ],
);
// Immutable page proofs allow bounded retryable fanout without consuming retries for successful progress.
export const waitlistFanoutPages = pgTable(
  'waitlist_fanout_pages',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    eventId: uuid('event_id').notNull(),
    afterEntryId: uuid('after_entry_id'),
    createdAt: instant('created_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.eventId],
      foreignColumns: [waitlistVacancyEvents.branchId, waitlistVacancyEvents.id],
    }),
    foreignKey({
      columns: [table.branchId, table.afterEntryId],
      foreignColumns: [waitlistEntries.branchId, waitlistEntries.id],
    }),
    uniqueIndex('waitlist_fanout_first_uq')
      .on(table.eventId)
      .where(sql`${table.afterEntryId} is null`),
    uniqueIndex('waitlist_fanout_after_uq')
      .on(table.eventId, table.afterEntryId)
      .where(sql`${table.afterEntryId} is not null`),
  ],
);
