import { and, asc, desc, eq, gt, ilike, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { supportTicketMessages, supportTickets, users } from '@hsm/db';
import { DomainError, supportTicketPageSchema, supportTicketSchema } from '@hsm/contracts';
import type { z } from 'zod';
import {
  supportMessagePageSchema,
  type supportMessageQuerySchema,
  type supportStaffQuerySchema,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';

type Reader = Pick<Transaction, 'select'>;
const opener = alias(users, 'support_opener'),
  assignee = alias(users, 'support_assignee'),
  author = alias(users, 'support_author');
const header = {
  ticket: supportTickets,
  openedByName: opener.fullName,
  assignedToName: assignee.fullName,
};
function base(tx: Reader) {
  return tx
    .select(header)
    .from(supportTickets)
    .innerJoin(opener, eq(opener.id, supportTickets.openedByUserId))
    .leftJoin(assignee, eq(assignee.id, supportTickets.assignedAdminUserId));
}
type Header = {
  ticket: typeof supportTickets.$inferSelect;
  openedByName: string;
  assignedToName: string | null;
};
function project(row: Header) {
  const t = row.ticket;
  return {
    id: t.id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    openedByName: row.openedByName,
    assignedToName: row.assignedToName,
    version: t.version,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
async function messageRows(
  tx: Reader,
  row: Header,
  includeInternal: boolean,
  limit: number,
  cursor?: string,
) {
  return tx
    .select({ message: supportTicketMessages, authorName: author.fullName })
    .from(supportTicketMessages)
    .innerJoin(author, eq(author.id, supportTicketMessages.authorUserId))
    .where(
      and(
        eq(supportTicketMessages.ticketId, row.ticket.id),
        includeInternal ? undefined : eq(supportTicketMessages.visibility, 'public'),
        cursor ? gt(supportTicketMessages.id, cursor) : undefined,
      ),
    )
    .orderBy(asc(supportTicketMessages.id))
    .limit(limit);
}
function projectMessage(row: Awaited<ReturnType<typeof messageRows>>[number], openerId: string) {
  return {
    id: row.message.id,
    authorName: row.authorName,
    fromSupport: row.message.authorUserId !== openerId,
    internal: row.message.visibility === 'internal',
    body: row.message.body,
    createdAt: row.message.createdAt.toISOString(),
  };
}
async function requireTicket(tx: Reader, ticketId: string, ownerId?: string) {
  const [row] = await base(tx).where(eq(supportTickets.id, ticketId));
  if (!row || (ownerId !== undefined && row.ticket.openedByUserId !== ownerId))
    throw new DomainError('NOT_FOUND', 404, 'Ticket unavailable');
  return row;
}
// Compatibility preview only: new staff and participant views traverse readSupportMessages.
export async function readSupportDetail(
  tx: Reader,
  ticketId: string,
  includeInternal: boolean,
  ownerId?: string,
) {
  const row = await requireTicket(tx, ticketId, ownerId);
  const messages = await messageRows(tx, row, includeInternal, 200);
  return supportTicketSchema.parse({
    ...project(row),
    messages: messages.map((m) => projectMessage(m, row.ticket.openedByUserId)),
  });
}
export async function readSupportMessages(
  tx: Reader,
  ticketId: string,
  query: z.infer<typeof supportMessageQuerySchema>,
  includeInternal: boolean,
  ownerId?: string,
) {
  const row = await requireTicket(tx, ticketId, ownerId);
  const rows = await messageRows(tx, row, includeInternal, query.limit + 1, query.cursor);
  const page = rows.slice(0, query.limit);
  return supportMessagePageSchema.parse({
    ticketId,
    data: page.map((m) => projectMessage(m, row.ticket.openedByUserId)),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.message.id ?? null) : null,
  });
}
export async function readSupportPage(
  tx: Reader,
  input: z.infer<typeof supportStaffQuerySchema>,
  ownerId?: string,
) {
  const literal = input.q?.replace(/[\\%_]/g, '\\$&');
  const rows = await base(tx)
    .where(
      and(
        ownerId ? eq(supportTickets.openedByUserId, ownerId) : undefined,
        input.status ? eq(supportTickets.status, input.status) : undefined,
        input.priority ? eq(supportTickets.priority, input.priority) : undefined,
        literal ? ilike(supportTickets.subject, '%' + literal + '%') : undefined,
        input.cursor ? lt(supportTickets.id, input.cursor) : undefined,
      ),
    )
    .orderBy(desc(supportTickets.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  return supportTicketPageSchema.parse({
    data: page.map(project),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.ticket.id ?? null) : null,
  });
}
