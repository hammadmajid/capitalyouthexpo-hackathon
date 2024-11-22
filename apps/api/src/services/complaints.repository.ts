import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  complaintAttachments,
  complaintEvents,
  complaints,
  files,
  managerAssignments,
  rooms,
  seats,
  users,
} from '@hsm/db';
import {
  DomainError,
  complaintDetailSchema,
  complaintSchema,
  type ComplaintStatus,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { unresolvedComplaints } from '../insights/dashboard-queue-predicates.js';
type Reader = Pick<Transaction, 'select'>;
const assignee = alias(users, 'complaint_assignee');
const reporter = alias(users, 'complaint_reporter');
const select = {
  complaint: complaints,
  roomLabel: rooms.label,
  bedLabel: seats.label,
  residentName: reporter.fullName,
  assignedToName: assignee.fullName,
};
function base(tx: Reader) {
  return tx
    .select(select)
    .from(complaints)
    .innerJoin(reporter, eq(reporter.id, complaints.userId))
    .leftJoin(rooms, eq(rooms.id, complaints.roomId))
    .leftJoin(seats, eq(seats.id, complaints.seatId))
    .leftJoin(assignee, eq(assignee.id, complaints.assignedToUserId));
}
type Row = Awaited<ReturnType<ReturnType<typeof base>['execute']>>[number];
async function attachmentsOf(tx: Reader, ids: string[]) {
  if (!ids.length) return new Map<string, string[]>();
  const rows = await tx
    .select({ complaintId: complaintAttachments.complaintId, fileId: complaintAttachments.fileId })
    .from(complaintAttachments)
    .where(inArray(complaintAttachments.complaintId, ids))
    .orderBy(asc(complaintAttachments.fileId))
    .limit(ids.length * 5);
  const map = new Map<string, string[]>();
  for (const row of rows)
    map.set(row.complaintId, [...(map.get(row.complaintId) ?? []), row.fileId]);
  return map;
}
function project(row: Row, attachments: string[]) {
  const c = row.complaint;
  return complaintSchema.parse({
    id: c.id,
    branchId: c.branchId,
    stayId: c.stayId,
    category: c.category,
    title: c.title,
    description: c.description,
    status: c.status,
    roomLabel: row.roomLabel,
    bedLabel: row.bedLabel,
    residentName: row.residentName ?? 'Resident',
    assignedToName: row.assignedToName,
    reopenCount: c.reopenCount,
    attachmentFileIds: attachments,
    version: c.version,
    createdAt: c.createdAt.toISOString(),
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    closedAt: c.closedAt?.toISOString() ?? null,
  });
}
// CMP-001..006: complaint reads. Callers have already proven the Stay or branch scope.
export class ComplaintRepository {
  async page(
    tx: Reader,
    where: {
      branchId?: string | undefined;
      stayId?: string | undefined;
      status?: ComplaintStatus | undefined;
      category?: string | undefined;
      unresolved?: boolean;
    },
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await base(tx)
      .where(
        and(
          where.branchId ? eq(complaints.branchId, where.branchId) : undefined,
          where.stayId ? eq(complaints.stayId, where.stayId) : undefined,
          where.status ? eq(complaints.status, where.status) : undefined,
          where.unresolved ? unresolvedComplaints() : undefined,
          where.category
            ? eq(complaints.category, where.category as Row['complaint']['category'])
            : undefined,
          cursor ? lt(complaints.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(complaints.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit),
      files = await attachmentsOf(
        tx,
        page.map((row) => row.complaint.id),
      );
    return {
      data: page.map((row) => project(row, files.get(row.complaint.id) ?? [])),
      nextCursor: rows.length > limit ? (page.at(-1)?.complaint.id ?? null) : null,
    };
  }
  async detail(tx: Reader, complaintId: string) {
    const [row] = await base(tx).where(eq(complaints.id, complaintId));
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Complaint unavailable');
    const actor = alias(users, 'complaint_actor');
    const events = await tx
      .select({ event: complaintEvents, actorName: actor.fullName })
      .from(complaintEvents)
      .innerJoin(actor, eq(actor.id, complaintEvents.actorUserId))
      .where(eq(complaintEvents.complaintId, complaintId))
      .orderBy(asc(complaintEvents.id))
      .limit(200);
    const attachments = await attachmentsOf(tx, [complaintId]);
    return complaintDetailSchema.parse({
      ...project(row, attachments.get(complaintId) ?? []),
      events: events.map(({ event, actorName }) => ({
        id: event.id,
        actorRole: event.actorRole,
        actorName: actorName ?? 'Staff',
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        note: event.note,
        createdAt: event.createdAt.toISOString(),
      })),
    });
  }
  // CMP-003: own clean private complaint uploads not used elsewhere; never public gallery files.
  async requireAttachments(tx: Transaction, userId: string, bucket: string, fileIds: string[]) {
    if (!fileIds.length) return;
    const rows = await tx
      .select({ id: files.id, objectKey: files.objectKey, digest: files.sha256 })
      .from(files)
      .where(
        and(
          inArray(files.id, fileIds),
          eq(files.uploadedBy, userId),
          eq(files.bucket, bucket),
          eq(files.visibility, 'private'),
          eq(files.purpose, 'complaint_attachment'),
          eq(files.scanStatus, 'clean'),
        ),
      )
      .for('update');
    const valid = rows.filter(
      (row) =>
        row.digest?.length === 32 &&
        row.objectKey.startsWith('private/complaint_attachment/' + row.id + '/'),
    );
    if (valid.length !== new Set(fileIds).size)
      throw new DomainError('NOT_FOUND', 404, 'Attachment unavailable');
    const [used] = await tx
      .select({ id: complaintAttachments.fileId })
      .from(complaintAttachments)
      .where(inArray(complaintAttachments.fileId, fileIds))
      .limit(1);
    if (used) throw new DomainError('CONFLICT', 409, 'An attachment is already in use');
  }
  async attachmentFile(tx: Reader, complaintId: string, fileId: string, bucket: string) {
    const [row] = await tx
      .select({ file: files })
      .from(complaintAttachments)
      .innerJoin(files, eq(files.id, complaintAttachments.fileId))
      .where(
        and(
          eq(complaintAttachments.complaintId, complaintId),
          eq(complaintAttachments.fileId, fileId),
          eq(files.scanStatus, 'clean'),
          eq(files.bucket, bucket),
        ),
      );
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Attachment unavailable');
    return row.file;
  }
  // p.33: an assignee is the branch Owner or an active Manager of this branch.
  async requireAssignee(tx: Reader, branchId: string, ownerId: string, userId: string) {
    if (userId === ownerId) return;
    const [row] = await tx
      .select({ id: managerAssignments.id })
      .from(managerAssignments)
      .where(
        and(
          eq(managerAssignments.branchId, branchId),
          eq(managerAssignments.userId, userId),
          eq(managerAssignments.status, 'active'),
        ),
      )
      .limit(1);
    if (!row) throw new DomainError('NOT_FOUND', 404, 'Assignee unavailable');
  }
}
