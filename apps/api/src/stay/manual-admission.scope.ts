import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { residents, users, type Database } from '@hsm/db';
import { DomainError, stayIdentifierSchema, type ManualAdmissionCommand } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import type { IdempotencyStore } from '../idempotency/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { requireActiveAccount } from '../auth/session.policy.js';
import { lockParticipants } from '../management/identity-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { IdempotencyRepository } from '../idempotency/repository.js';
type ResidentReference = ManualAdmissionCommand['manual']['resident'];
const storedResident = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  userId: stayIdentifierSchema.nullable(),
  archivedAt: z.date().nullable(),
});
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Admission relationship data unavailable');
}
async function residentUser(tx: Transaction, branchId: string, reference: ResidentReference) {
  if (reference.kind === 'new') return null;
  const [raw] = await tx
    .select({
      id: residents.id,
      branchId: residents.branchId,
      userId: residents.userId,
      archivedAt: residents.archivedAt,
    })
    .from(residents)
    .where(and(eq(residents.branchId, branchId), eq(residents.id, reference.residentId)))
    .for('update');
  if (!raw) throw new DomainError('NOT_FOUND', 404, 'Resident unavailable');
  const result = storedResident.safeParse(raw);
  if (!result.success) unavailable();
  const row = result.data;
  if (row.id !== reference.residentId || row.branchId !== branchId) unavailable();
  if (row.archivedAt !== null) throw new DomainError('CONFLICT', 409, 'Resident unavailable');
  return row.userId;
}
async function requireLinkedAccount(tx: Transaction, userId: string | null) {
  if (userId === null) return;
  const [row] = await tx
    .select({ id: users.id, status: users.accountStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || row.id !== userId) unavailable();
  requireActiveAccount(row.status);
}
// SEC-003 / CHG-010: manual financial terms need live stay_manage, rent_manage
// and finance_view. Reuse current actor/session and ordered participant primitives.
export async function lockManualAdmissionAuthority(
  tx: Transaction,
  actor: Actor,
  branchId: string,
  reference: ResidentReference,
  clock: () => Date,
  expectedUserId?: string | null,
) {
  await lockActor(tx, actor, clock);
  await lockInventoryScope(tx, actor, branchId, 'stay_manage');
  await lockInventoryScope(tx, actor, branchId, 'rent_manage');
  const scope = await lockInventoryScope(tx, actor, branchId, 'finance_view');
  await lockActor(tx, actor, clock);
  const userId = await residentUser(tx, branchId, reference);
  if (expectedUserId !== undefined && expectedUserId !== userId)
    throw new DomainError('CONFLICT', 409, 'Resident account link changed; reload admission');
  await requireLinkedAccount(tx, userId);
  return { ...scope, userId };
}
export async function manualAdmissionCommandContext(
  db: Database,
  actor: Actor,
  branchId: string,
  reference: ResidentReference,
  clock: () => Date,
): Promise<{ store: IdempotencyStore; userId: string | null }> {
  const target = await db.transaction((tx) =>
    lockManualAdmissionAuthority(tx, actor, branchId, reference, clock),
  );
  const store = new IdempotencyRepository(db, (tx, currentActor, now) =>
    target.userId === null
      ? lockActor(tx, currentActor, () => now)
      : lockParticipants(tx, currentActor, target.userId, () => now),
  );
  return { store, userId: target.userId };
}
