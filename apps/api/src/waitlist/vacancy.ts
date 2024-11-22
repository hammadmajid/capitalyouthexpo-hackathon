import { and, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  expectedVacancies,
  hasOperationalInventoryAvailability,
  waitlistTodayRange,
} from '@hsm/db';
import { DomainError, expectedVacancySchema, type SaveExpectedVacancy } from '@hsm/contracts';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { requireWaitlistType } from './access.js';
import { noticeVacancyDate } from './notice-vacancy.js';
export async function authorizeVacancy(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  roomTypeId: string,
  clock: () => Date,
  edit = false,
) {
  await lockActor(tx, actor, clock);
  const scope = await lockInventoryScope(tx, actor, branchId, edit ? 'listing_edit' : undefined);
  await requireWaitlistType(tx, branchId, roomTypeId);
  await lockActor(tx, actor, clock);
  return scope;
}
export async function readExpectedVacancy(tx: Transaction, branchId: string, roomTypeId: string) {
  const [row] = await tx
    .select()
    .from(expectedVacancies)
    .where(
      and(eq(expectedVacancies.branchId, branchId), eq(expectedVacancies.roomTypeId, roomTypeId)),
    );
  // CHG-040: the date comes from residents' departure notices, never from a typed estimate.
  return expectedVacancySchema.parse({
    branchId,
    roomTypeId,
    expectedVacancyDate: await noticeVacancyDate(tx, branchId, roomTypeId),
    version: row?.updatedAt.toISOString() ?? null,
  });
}
export async function saveExpectedVacancy(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  roomTypeId: string,
  input: SaveExpectedVacancy,
  clock: () => Date,
) {
  const scope = await authorizeVacancy(tx, actor, branchId, roomTypeId, clock, true);
  if (input.expectedVacancyDate !== null)
    throw new DomainError(
      'CONFLICT',
      409,
