import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import { notifications, type Database } from '@hsm/db';
import { DomainError, inboxPageSchema, inboxReadSchema, type ManagementPage } from '@hsm/contracts';
import { lockActor } from '../auth/actor-lock.js';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
export class InboxRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async owned(transaction: Transaction, actor: Actor, id: string) {
    const [row] = await transaction
      .select({ id: notifications.id, readAt: notifications.readAt })
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId)))
      .for('update');
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Notification unavailable');
    return row;
  }
  read(actor: Actor, page: ManagementPage) {
    return this.database.transaction(async (transaction) => {
      await lockActor(transaction, actor, this.clock);
      const [cursor] = page.cursor
        ? await transaction
            .select({ createdAt: notifications.createdAt, id: notifications.id })
            .from(notifications)
            .where(and(eq(notifications.id, page.cursor), eq(notifications.userId, actor.userId)))
        : [];
      if (page.cursor && !cursor)
        throw new DomainError('NOT_FOUND', 404, 'Notification unavailable');
      const rows = await transaction
        .select({
          id: notifications.id,
          type: notifications.type,
          title: notifications.title,
          body: notifications.body,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, actor.userId),
            cursor
              ? or(
                  lt(notifications.createdAt, cursor.createdAt),
                  and(
                    eq(notifications.createdAt, cursor.createdAt),
                    lt(notifications.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(page.limit + 1);
      const [unread] = await transaction
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)));
      const selected = rows.slice(0, page.limit);
      return inboxPageSchema.parse({
        data: selected.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          readAt: row.readAt?.toISOString() ?? null,
        })),
        nextCursor: rows.length > page.limit ? selected.at(-1)?.id : null,
        unreadCount: unread?.value ?? 0,
      });
    });
  }
  async markRead(transaction: Transaction, actor: Actor, id: string) {
    const row = await this.owned(transaction, actor, id);
    const readAt = row.readAt ?? this.clock();
    if (!row.readAt)
      await transaction
        .update(notifications)
        .set({ readAt })
        .where(and(eq(notifications.id, id), eq(notifications.userId, actor.userId)));
    return inboxReadSchema.parse({ id, readAt: readAt.toISOString() });
  }
}
