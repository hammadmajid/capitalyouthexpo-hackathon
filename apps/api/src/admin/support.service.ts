import { desc, eq, inArray } from 'drizzle-orm';
import {
  ANNOUNCEMENT_EVENT,
  announcements,
  branches,
  cities,
  notificationOutbox,
  supportTicketMessages,
  supportTickets,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  announcementInputSchema,
  announcementListSchema,
  announcementSchema,
  stayIdentifierSchema,
  supportQuerySchema,
  supportReplyInputSchema,
  supportStaffInputSchema,
  supportTicketInputSchema,
  supportTicketSchema,
} from '@hsm/contracts';
import { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { notify } from '../services/notify.js';
import { lockAdmin, platformAudit, type AdminRole } from './scope.js';
const id = stayIdentifierSchema;
import { supportMessageQuerySchema, supportStaffQuerySchema } from '@hsm/contracts';
import { readSupportDetail, readSupportMessages, readSupportPage } from './support-read.js';
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
// ADM-009 / ADM-010: platform support (not hostel complaints, not financial arbitration) and
// plain-text announcements delivered through the outbox worker.
export class SupportService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  open(actor: Actor, key: unknown, body: unknown) {
    const input = supportTicketInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST support ticket',
      201,
      input,
      supportTicketSchema,
      null,
      async (tx) => {
        await lockActor(tx, actor, this.clock);
        const now = this.clock();
        const [row] = await tx
          .insert(supportTickets)
          .values({
            openedByUserId: actor.userId,
            subject: input.subject,
            category: input.category,
            priority: 'normal',
            status: 'open',
            version: 1,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: supportTickets.id });
        if (!row) throw new DomainError('INTERNAL', 500, 'Ticket unavailable');
        await tx.insert(supportTicketMessages).values({
          ticketId: row.id,
          authorUserId: actor.userId,
          body: input.body,
          visibility: 'public',
          createdAt: now,
        });
        return readSupportDetail(tx, row.id, false);
      },
    );
  }
  ownPage(actor: Actor, query: unknown) {
    const input = supportQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      return readSupportPage(tx, input, actor.userId);
    });
  }
  ownDetail(actor: Actor, ticketId: unknown) {
    const ticket = id.parse(ticketId);
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      return readSupportDetail(tx, ticket, false, actor.userId);
    });
  }
  reply(actor: Actor, key: unknown, ticketId: unknown, body: unknown) {
    const ticket = id.parse(ticketId),
      input = supportReplyInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST support reply',
      200,
      { ticket, ...input },
      supportTicketSchema,
      null,
      async (tx) => {
        await lockActor(tx, actor, this.clock);
        const [row] = await tx
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.id, ticket))
          .for('update');
        if (!row || row.openedByUserId !== actor.userId)
          throw new DomainError('NOT_FOUND', 404, 'Ticket unavailable');
        if (row.status === 'closed') conflict('This ticket is closed; open a new one');
        const now = this.clock();
        await tx.insert(supportTicketMessages).values({
          ticketId: ticket,
          authorUserId: actor.userId,
          body: input.body,
          visibility: 'public',
          createdAt: now,
        });
        await tx
          .update(supportTickets)
          .set({
            status:
              row.status === 'waiting_for_user' || row.status === 'resolved' ? 'open' : row.status,
            version: row.version + 1,
            updatedAt: now,
          })
          .where(eq(supportTickets.id, ticket));
        return readSupportDetail(tx, ticket, false);
      },
    );
  }
  queue(actor: Actor, query: unknown) {
    const input = supportStaffQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'support', this.clock);
      return readSupportPage(tx, input);
    });
  }
  staffDetail(actor: Actor, ticketId: unknown) {
    const ticket = id.parse(ticketId);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'support', this.clock);
      return readSupportDetail(tx, ticket, true);
    });
  }
  staffMessages(actor: Actor, ticketId: unknown, query: unknown = {}) {
    const ticket = id.parse(ticketId),
      input = supportMessageQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'support', this.clock);
      return readSupportMessages(tx, ticket, input, true);
    });
  }
  ownMessages(actor: Actor, ticketId: unknown, query: unknown = {}) {
    const ticket = id.parse(ticketId),
      input = supportMessageQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      return readSupportMessages(tx, ticket, input, false, actor.userId);
    });
  }
  staffAct(actor: Actor, key: unknown, ticketId: unknown, body: unknown) {
    const ticket = id.parse(ticketId),
      input = supportStaffInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST support action',
      200,
      { ticket, ...input },
      supportTicketSchema,
      'support',
      async (tx) => {
        const scope = await lockAdmin(tx, actor, 'support', this.clock),
          now = this.clock();
        const [row] = await tx
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.id, ticket))
          .for('update');
        if (!row) throw new DomainError('NOT_FOUND', 404, 'Ticket unavailable');
        if (row.version !== input.expectedVersion) conflict('The ticket changed; reload first');
        if (row.status === 'closed' && input.status !== undefined)
          conflict('A closed ticket cannot change status');
        if (input.body)
          await tx.insert(supportTicketMessages).values({
            ticketId: ticket,
            authorUserId: actor.userId,
            body: input.body,
            visibility: input.internal ? 'internal' : 'public',
            createdAt: now,
          });
        await tx
          .update(supportTickets)
          .set({
            ...(input.status ? { status: input.status } : {}),
            ...(input.priority ? { priority: input.priority } : {}),
            ...(input.assignToMe ? { assignedAdminUserId: actor.userId } : {}),
            version: row.version + 1,
            updatedAt: now,
          })
          .where(eq(supportTickets.id, ticket));
        await platformAudit(
          tx,
          scope,
          {
            action: 'support.updated',
            targetType: 'support_ticket',
            targetId: ticket,
            before: { status: row.status, priority: row.priority },
            after: {
              status: input.status ?? row.status,
              priority: input.priority ?? row.priority,
              internalNote: Boolean(input.body && input.internal),
            },
          },
          now,
        );
        if (input.status || (input.body && !input.internal))
          await notify(
            tx,
            row.openedByUserId,
            'support.ticket_updated',
            ticket + ':' + (row.version + 1),
            now,
          );
        return readSupportDetail(tx, ticket, true);
      },
    );
  }
  announcementsList(actor: Actor) {
    return this.database.transaction(async (tx) => {
      await lockAdmin(tx, actor, 'support', this.clock);
      const rows = await tx
        .select()
        .from(announcements)
        .orderBy(desc(announcements.createdAt))
        .limit(50);
      return announcementListSchema.parse({ data: rows.map(projectAnnouncement) });
    });
  }
  announce(actor: Actor, key: unknown, body: unknown) {
    const input = announcementInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST announcement',
      201,
      input,
      announcementSchema,
      'support',
      async (tx) => {
        const scope = await lockAdmin(tx, actor, 'support', this.clock),
          now = this.clock(),
          at = input.scheduledAt ? new Date(input.scheduledAt) : now;
        if (at < new Date(now.getTime() - 60000))
          throw new DomainError('VALIDATION_FAILED', 400, 'Schedule a time in the future');
        if (input.branchIds.length) {
          const found = await tx
            .select({ id: branches.id })
            .from(branches)
            .where(inArray(branches.id, input.branchIds));
          if (found.length !== new Set(input.branchIds).size)
            throw new DomainError('NOT_FOUND', 404, 'Branch unavailable');
        }
        if (input.cityId) {
          const [city] = await tx
            .select({ id: cities.id })
            .from(cities)
            .where(eq(cities.id, input.cityId));
          if (!city) throw new DomainError('NOT_FOUND', 404, 'City unavailable');
        }
        const [row] = await tx
          .insert(announcements)
          .values({
            createdByUserId: actor.userId,
            audience: input.audience,
            branchIds: input.branchIds,
            cityId: input.cityId ?? null,
            title: input.title,
            body: input.body,
            status: 'scheduled',
            scheduledAt: at,
            version: 1,
            createdAt: now,
          })
          .returning();
        if (!row) throw new DomainError('INTERNAL', 500, 'Announcement unavailable');
        await tx.insert(notificationOutbox).values({
          eventType: ANNOUNCEMENT_EVENT,
          channel: 'internal',
          payload: { announcementId: row.id },
          dedupeKey: 'announcement:' + row.id,
          nextAttemptAt: at,
          createdAt: now,
        });
        await platformAudit(
          tx,
          scope,
          {
            action: 'announcement.scheduled',
            targetType: 'announcement',
            targetId: row.id,
            after: projectAnnouncement(row),
          },
          now,
        );
        return projectAnnouncement(row);
      },
    );
  }
  cancelAnnouncement(actor: Actor, key: unknown, announcementId: unknown) {
    const announcement = id.parse(announcementId);
    return this.command(
      actor,
      key,
      'POST announcement cancel',
      200,
      { announcement },
      announcementSchema,
      'support',
      async (tx) => {
        const scope = await lockAdmin(tx, actor, 'support', this.clock),
          now = this.clock();
        const [row] = await tx
          .select()
          .from(announcements)
          .where(eq(announcements.id, announcement))
          .for('update');
        if (!row) throw new DomainError('NOT_FOUND', 404, 'Announcement unavailable');
        if (row.status !== 'scheduled') conflict('Only a scheduled announcement can be cancelled');
        const [updated] = await tx
          .update(announcements)
          .set({ status: 'cancelled', version: row.version + 1 })
          .where(eq(announcements.id, announcement))
          .returning();
        await platformAudit(
          tx,
          scope,
          { action: 'announcement.cancelled', targetType: 'announcement', targetId: announcement },
          now,
        );
        return projectAnnouncement(updated ?? row);
      },
    );
  }
  private command<T>(
    actor: Actor,
    key: unknown,
    endpoint: string,
    status: 200 | 201,
    input: unknown,
    schema: z.ZodType<T>,
    role: AdminRole | null,
    work: (tx: Transaction) => Promise<unknown>,
  ) {
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint, status },
        {},
        input,
        schema,
        async (tx) => {
          if (role) await lockAdmin(tx, actor, role, this.clock);
          else await lockActor(tx, actor, this.clock);
          return true;
        },
        async () => work(requireTransaction()),
      )
      .catch(inventoryFailure);
  }
}
function projectAnnouncement(row: typeof announcements.$inferSelect) {
  return announcementSchema.parse({
    id: row.id,
    audience: row.audience,
    title: row.title,
    body: row.body,
    status: row.status,
    scheduledAt: row.scheduledAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    recipientCount: row.recipientCount,
    version: row.version,
  });
}
