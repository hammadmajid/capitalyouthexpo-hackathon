import { claimCoversStart } from '../booking/claim-overlap.js';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import { roomTypes, rooms, seats, inventoryClaims, expireRoomReservations } from '@hsm/db';
import { DomainError, inventoryMutationSchema } from '@hsm/contracts';
import type { AuditWriter, Transaction } from '../audit/writer.js';
import type { Actor } from '../authorization/store.js';
import { lockActor } from '../auth/actor-lock.js';
import { pakistanToday } from '../booking/policy.js';
import { lockInventoryScope } from './scope.js';
import { lockLifecycleTarget, type LifecycleTarget } from './lifecycle-target.js';
export class InventoryLifecycleRepository {
  constructor(
    private readonly audit: AuditWriter,
    private readonly clock: () => Date,
  ) {}
  private async available(
    database: Transaction,
    branchId: string,
    locked: Awaited<ReturnType<typeof lockLifecycleTarget>>,
  ) {
    for (const roomId of locked.roomIds)
      await expireRoomReservations(database, roomId, this.clock());
    if (locked.roomIds.length === 0) return;
    const now = this.clock();
    const [claim] = await database
      .select({ id: inventoryClaims.id })
      .from(inventoryClaims)
      .where(
        and(
          eq(inventoryClaims.branchId, branchId),
          inArray(inventoryClaims.roomId, locked.roomIds),
          isNull(inventoryClaims.releasedAt),
          claimCoversStart(inventoryClaims, pakistanToday(now), now),
          or(isNull(inventoryClaims.expiresAt), gt(inventoryClaims.expiresAt, now)),
          locked.seatId
            ? or(isNull(inventoryClaims.seatId), eq(inventoryClaims.seatId, locked.seatId))
            : undefined,
        ),
      )
      .limit(1);
    if (claim)
      throw new DomainError(
        'CONFLICT',
        409,
        'Resolve live reservations before taking inventory offline',
      );
  }
  async state(
    database: Transaction,
    actor: Actor,
    branchId: string,
    target: LifecycleTarget & { kind: 'room' | 'seat' },
    status: 'active' | 'inactive' | 'maintenance',
    reason: string,
  ) {
    const scope = await lockInventoryScope(database, actor, branchId, 'inventory_edit');
    const locked = await lockLifecycleTarget(database, branchId, target);
    if (status !== 'active') await this.available(database, branchId, locked);
    await lockActor(database, actor, this.clock);
    const now = this.clock();
    if (target.kind === 'room')
      await database
        .update(rooms)
        .set({ status, updatedAt: now })
        .where(
          and(eq(rooms.id, target.id), eq(rooms.branchId, branchId), isNull(rooms.archivedAt)),
        );
    else
      await database
        .update(seats)
        .set({ status, updatedAt: now })
        .where(
          and(eq(seats.id, target.id), eq(seats.branchId, branchId), isNull(seats.archivedAt)),
        );
    return this.record(
      database,
      actor,
      scope,
      branchId,
      target,
      'state_changed',
      { status, reason },
      now,
      { status: locked.previousStatus },
    );
  }
  async archive(
    database: Transaction,
    actor: Actor,
    branchId: string,
    target: LifecycleTarget,
    reason: string,
  ) {
    const scope = await lockInventoryScope(database, actor, branchId, 'inventory_edit');
    if (target.kind === 'room_type')
      await lockInventoryScope(database, actor, branchId, 'pricing_edit');
    const locked = await lockLifecycleTarget(database, branchId, target);
    await this.available(database, branchId, locked);
    await lockActor(database, actor, this.clock);
    const now = this.clock(),
      values = { archivedAt: now, updatedAt: now };
    if (target.kind === 'seat')
      await database
        .update(seats)
        .set(values)
        .where(
          and(eq(seats.id, target.id), eq(seats.branchId, branchId), isNull(seats.archivedAt)),
        );
    else if (locked.roomIds.length) {
      await database
        .update(seats)
        .set(values)
        .where(
          and(
            eq(seats.branchId, branchId),
            inArray(seats.roomId, locked.roomIds),
            isNull(seats.archivedAt),
          ),
        );
      await database
        .update(rooms)
        .set(values)
        .where(
          and(
            eq(rooms.branchId, branchId),
            inArray(rooms.id, locked.roomIds),
            isNull(rooms.archivedAt),
          ),
        );
    }
    if (target.kind === 'room_type')
      await database
        .update(roomTypes)
        .set(values)
        .where(
          and(
            eq(roomTypes.id, target.id),
            eq(roomTypes.branchId, branchId),
            isNull(roomTypes.archivedAt),
          ),
        );
    return this.record(
      database,
      actor,
      scope,
      branchId,
      target,
      'archived',
      { archivedAt: now.toISOString(), roomIds: locked.roomIds, reason },
      now,
      { archivedAt: null },
    );
  }
  private async record(
    database: Transaction,
    actor: Actor,
    scope: Awaited<ReturnType<typeof lockInventoryScope>>,
    branchId: string,
    target: LifecycleTarget,
    action: string,
    after: Record<string, unknown>,
    now: Date,
    before: Record<string, unknown>,
  ) {
    const result = inventoryMutationSchema.parse({ id: target.id, branchId, kind: target.kind });
    await this.audit.hostel(database, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      action: 'inventory.' + target.kind + '.' + action,
      targetType: target.kind,
      targetId: target.id,
      before,
      after,
      createdAt: now,
    });
    return result;
  }
}
