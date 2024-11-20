import { and, desc, eq, lte } from 'drizzle-orm';
import { z } from 'zod';
import {
  billingAgreementTermsSchema,
  databaseDateSchema,
  DomainError,
  stayIdentifierSchema,
  stayNoticeInputSchema,
  stayVersionSchema,
} from '@hsm/contracts';
import { stays, stayAgreements } from './schema/index.js';
import { lockInventoryBranch } from './inventory-lock.js';
import type { PostingTransaction } from './resident-posting-context.js';
export const noticeScopeSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    actorUserId: stayIdentifierSchema,
    actorRole: z.enum(['owner', 'manager', 'customer']),
  })
  .strict();
export const noticeCommandSchema = z
  .object({ scope: noticeScopeSchema, notice: stayNoticeInputSchema })
  .strict();
export type NoticeScope = z.infer<typeof noticeScopeSchema>;
export type NoticeCommand = z.infer<typeof noticeCommandSchema>;
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Stay notice data unavailable');
}
const storedStay = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  userId: stayIdentifierSchema.nullable(),
  version: stayVersionSchema,
  state: z.string(),
  moveInDate: databaseDateSchema,
  checkedInAt: z.date().nullable(),
  closedAt: z.date().nullable(),
});
export async function noticeContext(
  tx: PostingTransaction,
  input: NoticeCommand,
  now: Date,
  today: string,
) {
  const hierarchy = await lockInventoryBranch(tx, input.scope.branchId);
  if (
    [hierarchy.organization, hierarchy.brand, hierarchy.branch].some(
      (row) => row.archivedAt !== null,
    )
  )
    throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
  const [raw] = await tx
    .select()
    .from(stays)
    .where(and(eq(stays.branchId, input.scope.branchId), eq(stays.id, input.scope.stayId)))
    .for('update');
  if (!raw) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const result = storedStay.safeParse(raw);
  if (!result.success) unavailable();
  const stay = result.data;
  validateNoticeStay(stay, input, now, today);
  const agreement = await noticeAgreement(tx, input.scope, today);
  return { stay, ...agreement, organizationId: hierarchy.organization.id };
}
const storedAgreement = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  stayId: stayIdentifierSchema,
  effectiveFrom: databaseDateSchema,
  policyVersionId: stayIdentifierSchema,
  rentAmountPaisa: z.bigint().nonnegative(),
  depositPaisa: z.bigint().nonnegative(),
  termsSnapshot: billingAgreementTermsSchema,
});
async function noticeAgreement(tx: PostingTransaction, scope: NoticeScope, today: string) {
  const [agreement] = await tx
    .select()
    .from(stayAgreements)
    .where(
      and(
        eq(stayAgreements.branchId, scope.branchId),
        eq(stayAgreements.stayId, scope.stayId),
        lte(stayAgreements.effectiveFrom, today),
      ),
    )
    .orderBy(desc(stayAgreements.version))
    .limit(1);
  const parsed = storedAgreement.safeParse(agreement);
  if (!parsed.success) unavailable();
  const row = parsed.data,
    terms = row.termsSnapshot;
  if (row.branchId !== scope.branchId || row.stayId !== scope.stayId || row.effectiveFrom > today)
    unavailable();
  if (
    terms.policyVersionId !== row.policyVersionId ||
    BigInt(terms.rentAmountPaisa) !== row.rentAmountPaisa ||
    BigInt(terms.depositPaisa) !== row.depositPaisa
  )
    unavailable();
  return { agreementId: row.id, terms };
}

function validateNoticeStay(
  stay: z.infer<typeof storedStay>,
  input: NoticeCommand,
  now: Date,
  today: string,
) {
  if (stay.id !== input.scope.stayId || stay.branchId !== input.scope.branchId) unavailable();
  if (input.scope.actorRole === 'customer' && stay.userId !== input.scope.actorUserId)
    throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (stay.version !== input.notice.expectedVersion)
    throw new DomainError('CONFLICT', 409, 'Stay changed; reload before giving notice');
  requireActiveNoticeStay(stay, now, today);
  if (stay.version === 2147483647) throw new DomainError('CONFLICT', 409, 'Stay version exhausted');
}

function requireActiveNoticeStay(stay: z.infer<typeof storedStay>, now: Date, today: string) {
  if (
    stay.state !== 'active' ||
    stay.closedAt !== null ||
    stay.checkedInAt === null ||
    stay.checkedInAt > now ||
    stay.moveInDate > today
  )
    throw new DomainError('CONFLICT', 409, 'Only an actually active Stay can receive notice');
}
