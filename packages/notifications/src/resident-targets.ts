import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  stays,
  stayHistory,
  stayAssignments,
  stayAgreements,
  branches,
  organizations,
} from '@hsm/db';
import {
  InvalidNotificationJob,
  type ResidentLifecycleLease,
  type NotificationEvent,
} from './contracts.js';
import type { NotificationTransaction } from './producer.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const staySchema = z.object({
  id,
  branchId: id,
  residentId: id,
  userId: id.nullable(),
  source: z.enum(['manual', 'booking']),
  checkedInAt: z.date(),
});
const historySchema = z.object({
  id,
  branchId: id,
  stayId: id,
  previousState: z.null(),
  nextState: z.literal('active'),
  reasonCode: z.enum(['manual_admission', 'booking_check_in']),
  createdAt: z.date(),
  detail: z.object({
    residentId: id,
    userId: id.nullable(),
    assignmentId: id,
    agreementId: id,
    source: z.enum(['manual', 'booking']),
  }),
});
function required<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidNotificationJob();
  return parsed.data;
}
type Source = { stay: z.infer<typeof staySchema>; history: z.infer<typeof historySchema> };
async function source(
  tx: NotificationTransaction,
  job: ResidentLifecycleLease['payload'],
  now: Date,
): Promise<Source> {
  const [stayRaw] = await tx.select().from(stays).where(eq(stays.id, job.stayId)).limit(1),
    stay = required(staySchema, stayRaw);
  const [historyRaw] = await tx
      .select()
      .from(stayHistory)
      .where(
        and(
          eq(stayHistory.id, job.historyId),
          eq(stayHistory.stayId, job.stayId),
          eq(stayHistory.branchId, stay.branchId),
        ),
      )
      .limit(1),
    history = required(historySchema, historyRaw);
  if (
    stay.id !== job.stayId ||
    history.id !== job.historyId ||
    history.stayId !== job.stayId ||
    history.branchId !== stay.branchId
  )
    throw new InvalidNotificationJob();
  requireHistoryBinding(stay, history, now);
  return { stay, history };
}
function requireHistoryBinding(stay: Source['stay'], history: Source['history'], now: Date) {
  if (
    history.detail.residentId !== stay.residentId ||
    history.detail.source !== stay.source ||
    history.reasonCode !== (stay.source === 'manual' ? 'manual_admission' : 'booking_check_in')
  )
    throw new InvalidNotificationJob();
  if (stay.checkedInAt > history.createdAt || history.createdAt > now)
    throw new InvalidNotificationJob();
}
async function requireAdmissionReferences(tx: NotificationTransaction, { stay, history }: Source) {
  const [assignment] = await tx
    .select({
      id: stayAssignments.id,
      stayId: stayAssignments.stayId,
      branchId: stayAssignments.branchId,
      startedAt: stayAssignments.startedAt,
    })
    .from(stayAssignments)
    .where(
      and(
        eq(stayAssignments.id, history.detail.assignmentId),
        eq(stayAssignments.stayId, stay.id),
        eq(stayAssignments.branchId, stay.branchId),
      ),
    )
    .limit(1);
  const assignmentRow = required(
    z.object({ id, stayId: id, branchId: id, startedAt: z.date() }),
    assignment,
  );
  if (
    assignmentRow.id !== history.detail.assignmentId ||
    assignmentRow.stayId !== stay.id ||
    assignmentRow.branchId !== stay.branchId ||
    assignmentRow.startedAt.getTime() !== stay.checkedInAt.getTime()
  )
    throw new InvalidNotificationJob();
  const [agreement] = await tx
    .select({
      id: stayAgreements.id,
      stayId: stayAgreements.stayId,
      branchId: stayAgreements.branchId,
      version: stayAgreements.version,
    })
    .from(stayAgreements)
    .where(
      and(
        eq(stayAgreements.id, history.detail.agreementId),
        eq(stayAgreements.stayId, stay.id),
        eq(stayAgreements.branchId, stay.branchId),
      ),
    )
    .limit(1);
  const agreementRow = required(
    z.object({ id, stayId: id, branchId: id, version: z.literal(1) }),
    agreement,
  );
  if (
    agreementRow.id !== history.detail.agreementId ||
    agreementRow.stayId !== stay.id ||
    agreementRow.branchId !== stay.branchId
  )
    throw new InvalidNotificationJob();
}
// NTF-002 / SEC-003: immutable admission history selects original recipients.
// A later identity link never creates a recipient retroactively; a changed link
// suppresses that former recipient while retaining the current Owner's safe notice.
export async function residentLifecycleTargets(
  tx: NotificationTransaction,
  job: ResidentLifecycleLease['payload'],
  now: Date,
) {
  const context = await source(tx, job, now);
  await requireAdmissionReferences(tx, context);
  const [ownerRaw] = await tx
    .select({ userId: organizations.ownerUserId })
    .from(branches)
    .innerJoin(organizations, eq(organizations.id, branches.organizationId))
    .where(eq(branches.id, context.stay.branchId))
    .limit(1);
  const owner = required(z.object({ userId: id }), ownerRaw);
  const targets: { userId: string; event: NotificationEvent }[] = [
    { userId: owner.userId, event: 'resident.admission_recorded' },
  ];
  const originalUserId = context.history.detail.userId;
  if (originalUserId !== null && originalUserId === context.stay.userId)
    targets.push({ userId: originalUserId, event: 'resident.stay_started' });
  return targets.sort((left, right) => left.userId.localeCompare(right.userId));
}
