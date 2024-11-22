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
      "Vacancy dates now come from residents' departure notices and cannot be typed in",
    );
  const before = await readExpectedVacancy(tx, branchId, roomTypeId),
    now = clock();
  if (before.version !== input.expectedVersion)
    throw new DomainError(
      'PRECONDITION_FAILED',
      412,
      'Vacancy estimate changed; reload before saving',
    );
  if (
    input.expectedVacancyDate !== null &&
    (await hasOperationalInventoryAvailability(
      tx,
      branchId,
      waitlistTodayRange(now),
      now,
      roomTypeId,
    ))
  )
    throw new DomainError(
      'CONFLICT',
      409,
      'Publish an expected vacancy only for a currently full room type',
    );
  const updatedAt = new Date(
    Math.max(now.getTime(), before.version ? Date.parse(before.version) + 1 : now.getTime()),
  );
  await tx
    .insert(expectedVacancies)
    .values({
      id: v7(),
      branchId,
      roomTypeId,
      expectedVacancyDate: input.expectedVacancyDate,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [expectedVacancies.branchId, expectedVacancies.roomTypeId],
      set: { expectedVacancyDate: input.expectedVacancyDate, updatedAt },
    });
  const after = await readExpectedVacancy(tx, branchId, roomTypeId);
  await new AuditWriter().hostel(tx, {
    actorUserId: actor.userId,
    actorRole: scope.actorRole,
    organizationId: scope.organizationId,
    branchId,
    action: 'waitlist.expected_vacancy.changed',
    targetType: 'room_type',
    targetId: roomTypeId,
    before,
    after,
    createdAt: now,
  });
  return after;
}
