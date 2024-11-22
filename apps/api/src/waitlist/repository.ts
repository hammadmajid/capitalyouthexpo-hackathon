import { and, eq, isNull } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  waitlistEntries,
  readPublicInventoryBranch,
  reconcileWaitlistAvailability,
  type Database,
} from '@hsm/db';
import type { JoinWaitlist, WaitlistQuery } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import {
  authorizeWaitlistBranch,
  authorizeWaitlistCustomer,
  lockOwnWaitlistEntry,
  lockWaitlistListing,
} from './access.js';
import { readWaitlistEntry, readWaitlistPage } from './projection.js';
import { authorizeVacancy, readExpectedVacancy, saveExpectedVacancy } from './vacancy.js';
import { DomainError, publicWaitlistOpenSchema, type SaveExpectedVacancy } from '@hsm/contracts';
import { noticeRoomTypeIds, noticeVacancyDate } from './notice-vacancy.js';

export class WaitlistRepository {
  constructor(
    readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, branchId?: string, entryId?: string) {
    if (branchId) await authorizeWaitlistBranch(tx, actor, branchId, this.clock);
    else await authorizeWaitlistCustomer(tx, actor, this.clock);
    if (entryId) await lockOwnWaitlistEntry(tx, actor, entryId);
    await lockActor(tx, actor, this.clock);
    return true;
  }
  async authorizeVacancy(tx: Transaction, actor: Actor, branchId: string, roomTypeId: string) {
    await authorizeVacancy(tx, actor, branchId, roomTypeId, this.clock, true);
    return true;
  }
  // CHG-040: public — 404 unless the hostel is publicly listed, so ids cannot be probed.
  publicOpen(branchId: string) {
    return this.database.transaction(async (tx) => {
      if (!(await readPublicInventoryBranch(tx, branchId)))
        throw new DomainError('NOT_FOUND', 404, 'Hostel unavailable');
      const roomTypeIds = await noticeRoomTypeIds(tx, branchId);
      return publicWaitlistOpenSchema.parse({ open: roomTypeIds.length > 0, roomTypeIds });
    });
  }
  vacancy(actor: Actor, branchId: string, roomTypeId: string) {
    return this.database.transaction(async (tx) => {
      await authorizeVacancy(tx, actor, branchId, roomTypeId, this.clock);
      return readExpectedVacancy(tx, branchId, roomTypeId);
    });
  }
  saveVacancy(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    roomTypeId: string,
    input: SaveExpectedVacancy,
  ) {
    return saveExpectedVacancy(tx, actor, branchId, roomTypeId, input, this.clock);
  }
  list(actor: Actor, query: WaitlistQuery, branchId?: string) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branchId);
      return readWaitlistPage(
        tx,
        branchId ? { branchId } : { customerUserId: actor.userId },
        query,
      );
    });
  }
  async join(tx: Transaction, actor: Actor, input: JoinWaitlist) {
    await lockWaitlistListing(tx, input.branchId, input.roomTypeId);
    await lockActor(tx, actor, this.clock);
    const [existing] = await tx
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.customerUserId, actor.userId),
          eq(waitlistEntries.branchId, input.branchId),
          input.roomTypeId
            ? eq(waitlistEntries.roomTypeId, input.roomTypeId)
            : isNull(waitlistEntries.roomTypeId),
          isNull(waitlistEntries.leftAt),
        ),
      );
    if (existing) return readWaitlistEntry(tx, existing.id);
    // CHG-040: no resident on notice means no bed is coming free, so there is nothing to wait for.
    if (!(await noticeVacancyDate(tx, input.branchId, input.roomTypeId)))
      throw new DomainError(
        'CONFLICT',
        409,
        'This room is full and no resident has given notice yet, so there is no bed to wait for.',
      );
    const now = this.clock(),
      id = v7();
    await tx.insert(waitlistEntries).values({
      id,
      customerUserId: actor.userId,
      branchId: input.branchId,
      roomTypeId: input.roomTypeId ?? null,
      joinedAt: now,
    });
    await reconcileWaitlistAvailability(tx, input.branchId, now, input.roomTypeId);
    return readWaitlistEntry(tx, id);
  }
  async leave(tx: Transaction, actor: Actor, entryId: string) {
    const row = await lockOwnWaitlistEntry(tx, actor, entryId);
    await lockActor(tx, actor, this.clock);
    if (row.leftAt === null)
      await tx
        .update(waitlistEntries)
        .set({ leftAt: new Date(Math.max(this.clock().getTime(), row.joinedAt.getTime())) })
        .where(eq(waitlistEntries.id, entryId));
    return readWaitlistEntry(tx, entryId);
  }
}
