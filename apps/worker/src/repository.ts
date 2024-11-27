import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { notificationOutbox, type Database } from '@hsm/db';
export type OutboxMessage = typeof notificationOutbox.$inferSelect;
export class OutboxRepository {
  constructor(private readonly database: Database) {}
  due(now: Date) {
    return this.database
      .select({
        id: notificationOutbox.id,
        attempts: notificationOutbox.attempts,
        nextAttemptAt: notificationOutbox.nextAttemptAt,
      })
      .from(notificationOutbox)
      .where(
        and(
          inArray(notificationOutbox.status, ['pending', 'failed']),
          lte(notificationOutbox.nextAttemptAt, now),
          or(
            isNull(notificationOutbox.leaseExpiresAt),
            lte(notificationOutbox.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(notificationOutbox.nextAttemptAt)
      .limit(100);
  }
  claim(id: string, now: Date) {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .select()
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, id))
        .for('update');
      if (
        !row ||
        row.status === 'sent' ||
        row.status === 'dead' ||
        row.nextAttemptAt > now ||
        (row.leaseExpiresAt && row.leaseExpiresAt > now)
      )
        return undefined;
      if (row.attempts >= 5) {
        await transaction
          .update(notificationOutbox)
          .set({
            status: 'dead',
            lastError: 'DELIVERY_EXHAUSTED',
            leaseToken: null,
            leaseExpiresAt: null,
          })
          .where(eq(notificationOutbox.id, id));
        return undefined;
      }
      const [claimed] = await transaction
        .update(notificationOutbox)
        .set({
          status: 'pending',
          attempts: row.attempts + 1,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + 60_000),
        })
        .where(eq(notificationOutbox.id, id))
        .returning();
      return claimed;
    });
  }
  async sent(row: OutboxMessage, messageId: string, now: Date) {
    if (!row.leaseToken) return;
    await this.database
      .update(notificationOutbox)
      .set({
        status: 'sent',
        sentAt: now,
        providerMessageId: messageId,
        lastError: null,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(eq(notificationOutbox.id, row.id), eq(notificationOutbox.leaseToken, row.leaseToken)),
      );
  }
  async failed(
    row: OutboxMessage,
    code: 'DELIVERY_FAILED' | 'INVALID_MESSAGE' | 'EXPIRED_MESSAGE',
    now: Date,
  ) {
    if (!row.leaseToken) return;
    await this.database
      .update(notificationOutbox)
      .set({
        status: code !== 'DELIVERY_FAILED' || row.attempts >= 5 ? 'dead' : 'failed',
        nextAttemptAt: new Date(now.getTime() + Math.min(300_000, 1000 * 2 ** row.attempts)),
        lastError: code,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(eq(notificationOutbox.id, row.id), eq(notificationOutbox.leaseToken, row.leaseToken)),
      );
  }
}
