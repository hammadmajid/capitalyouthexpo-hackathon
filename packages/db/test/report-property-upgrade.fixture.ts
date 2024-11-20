import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { users, organizations, brands, branches, roomTypes } from '../src/schema/index.js';
import { inventoryStatus } from '../src/schema/inventory-enums.js';
import type { Database } from '../src/index.js';

export const propertyMigrations = fileURLToPath(new URL('../migrations/', import.meta.url));
const scratch = fileURLToPath(new URL('../../../.tools/', import.meta.url));
const journalSchema = z
  .object({
    entries: z.array(
      z
        .object({
          idx: z.number().int(),
          tag: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export async function previousPropertyMigrations() {
  const journal = journalSchema.parse(
    JSON.parse(await readFile(join(propertyMigrations, 'meta/_journal.json'), 'utf8')),
  );
  const entries = journal.entries.filter((entry) => entry.idx < 59);
  if (entries.at(-1)?.idx !== 58 || !journal.entries.some((entry) => entry.idx === 59))
    throw new Error('Property upgrade migration boundary unavailable');
  const folder = await mkdtemp(join(scratch, 'audit-010-legacy-'));
  await mkdir(join(folder, 'meta'));
  for (const entry of entries)
    await copyFile(join(propertyMigrations, entry.tag + '.sql'), join(folder, entry.tag + '.sql'));
  await writeFile(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({ ...journal, entries }, null, 2),
  );
  return folder;
}
export async function removePreviousPropertyMigrations(folder: string) {
  const target = resolve(folder);
  if (dirname(target) !== resolve(scratch) || !basename(target).startsWith('audit-010-legacy-'))
    throw new Error('Refusing cleanup outside the dedicated audit migration fixture');
  await rm(target, { recursive: true, force: true });
}
// The old room mapping intentionally has no floor_id column. Current Drizzle
// inserts enumerate all mapped columns, which would be invalid before migration.
export const previousRooms = pgTable('rooms', {
  id: uuid('id').primaryKey(),
  branchId: uuid('branch_id').notNull(),
  roomTypeId: uuid('room_type_id').notNull(),
  label: text('label').notNull(),
  status: inventoryStatus('status').notNull(),
});
export async function previousPropertyRoom(db: Database) {
  const owner = randomUUID(),
    organization = randomUUID(),
    brand = randomUUID();
  const branchId = randomUUID(),
    roomTypeId = randomUUID(),
    roomId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: owner, fullName: 'Synthetic migration owner' });
    await tx
      .insert(organizations)
      .values({ id: organization, ownerUserId: owner, name: 'Migration fixture' });
    await tx
      .insert(brands)
      .values({ id: brand, organizationId: organization, name: 'Migration fixture' });
    await tx.insert(branches).values({
      id: branchId,
      brandId: brand,
      organizationId: organization,
      name: 'Migration fixture',
      slug: branchId,
    });
    await tx.insert(roomTypes).values({
      id: roomTypeId,
      branchId,
      name: 'Existing rent terms',
      capacity: 2,
      inventoryMode: 'per_bed',
      bedMonthlyRentPaisa: 123456n,
      depositPaisa: 12345n,
    });
    await tx
      .insert(previousRooms)
      .values({ id: roomId, branchId, roomTypeId, label: 'Existing room', status: 'active' });
  });
  return { branchId, roomTypeId, roomId };
}
