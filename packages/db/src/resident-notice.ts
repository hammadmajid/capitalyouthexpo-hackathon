import { and, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { z } from 'zod';
import { databaseDateSchema, DomainError, planStayNotice } from '@hsm/contracts';
import { stays, stayHistory, hostelAuditLog } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import {
  noticeCommandSchema,
  noticeContext,
  type NoticeScope,
  type NoticeCommand,
} from './resident-notice-context.js';
export type NoticeAuthorizer = (
  tx: PostingTransaction,
  scope: NoticeScope,
  now: Date,
) => Promise<void>;
export type NoticePublisher = (
  tx: PostingTransaction,
  notice: { userId: string; stayId: string; noticeId: string },
  now: Date,
) => Promise<void>;
// OUT-001/002/006: internal source only. Caller owns authorized idempotency and
// proves current identity/session and staff grants before hierarchy/Stay locks.
// No authorization/publisher fallback, payment posting or inventory release exists.
export async function recordResidentNotice(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
  authorize?: NoticeAuthorizer,
  publish?: NoticePublisher,
) {
  const input = noticeCommandSchema.parse(value),
    now = z.date().parse(clock);
  if (typeof authorize !== 'function')
    throw new DomainError('INTERNAL', 503, 'Notice authorization unavailable');
  await authorize(tx, input.scope, now);
  const today = noticeDate(now);
  const context = await noticeContext(tx, input, now, today);
  if (context.stay.userId !== null && typeof publish !== 'function')
    throw new DomainError('INTERNAL', 503, 'Required notice delivery unavailable');
  const plan = planStayNotice({
      submittedOn: today,
      terms: context.terms,
      notice: input.notice,
    }),
    noticeId = v7(),
    version = context.stay.version + 1;
  await advanceNoticeState(tx, input.scope, context.stay.version, now);
  await writeNoticeHistory(tx, input, context, plan, noticeId, version, now);
  if (context.stay.userId !== null && publish)
    await publish(tx, { userId: context.stay.userId, stayId: input.scope.stayId, noticeId }, now);
  return {
    noticeId,
    stayId: input.scope.stayId,
    state: 'notice_given' as const,
    version,
    plan,
  };
}

function noticeDate(now: Date) {
  return databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
}

async function advanceNoticeState(
  tx: PostingTransaction,
  scope: NoticeScope,
  expectedVersion: number,
  now: Date,
) {
  const version = expectedVersion + 1;
  const [updated] = await tx
    .update(stays)
    .set({ state: 'notice_given', version, updatedAt: now })
    .where(
      and(
        eq(stays.branchId, scope.branchId),
        eq(stays.id, scope.stayId),
        eq(stays.version, expectedVersion),
      ),
    )
    .returning({ id: stays.id, version: stays.version });
  if (!updated || updated.id !== scope.stayId || updated.version !== version)
    throw new DomainError('CONFLICT', 409, 'Stay changed; reload before giving notice');
}

async function writeNoticeHistory(
  tx: PostingTransaction,
  input: NoticeCommand,
  context: Awaited<ReturnType<typeof noticeContext>>,
  plan: ReturnType<typeof planStayNotice>,
  noticeId: string,
  version: number,
  now: Date,
) {
  const detail = {
    ...plan,
    agreementId: context.agreementId,
    reason: input.notice.reason ?? null,
  };
  await tx.insert(stayHistory).values({
    id: noticeId,
    branchId: input.scope.branchId,
    stayId: input.scope.stayId,
    actorUserId: input.scope.actorUserId,
    previousState: 'active',
    nextState: 'notice_given',
    reasonCode: 'notice_submitted',
    detail,
    createdAt: now,
  });
  await tx.insert(hostelAuditLog).values({
    organizationId: context.organizationId,
    branchId: input.scope.branchId,
    actorUserId: input.scope.actorUserId,
    actorRole: input.scope.actorRole,
    action: 'resident.notice.submitted',
    targetType: 'stay',
    targetId: input.scope.stayId,
    before: { state: 'active', version: context.stay.version },
    after: { state: 'notice_given', version, noticeId, ...detail },
    createdAt: now,
  });
}
