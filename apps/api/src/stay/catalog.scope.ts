import { and, eq } from 'drizzle-orm';
import { residentChargeCatalog } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
// FIN-004 / SEC-003: use canonical live branch grants; catalogue writes stay Owner-only.
export async function catalogScope(
  transaction: Transaction,
  actor: Actor,
  branchId: string,
  clock: () => Date,
  ownerOnly = false,
) {
  await lockActor(transaction, actor, clock);
  const scope = await lockInventoryScope(
    transaction,
    actor,
    branchId,
    ownerOnly ? undefined : 'finance_view',
    ownerOnly,
  );
  await lockActor(transaction, actor, clock);
  return scope;
}
export async function lockCatalogEntry(transaction: Transaction, branchId: string, id: string) {
  const rows = await transaction
    .select()
    .from(residentChargeCatalog)
    .where(and(eq(residentChargeCatalog.branchId, branchId), eq(residentChargeCatalog.id, id)))
    .limit(1)
    .for('update');
  const row = rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Catalogue entry unavailable');
  if (rows.length !== 1 || row.branchId !== branchId || row.id !== id)
    throw new DomainError('INTERNAL', 500, 'Catalogue scope unavailable');
  return row;
}
