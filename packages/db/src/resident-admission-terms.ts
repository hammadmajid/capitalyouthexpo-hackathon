import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  billingAgreementTermsSchema,
  billingPolicySchema,
  billingCatalogSnapshotSchema,
  DomainError,
  money,
  moneyToJson,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { billingPolicies, residentChargeCatalog } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
const inputSchema = z
  .object({
    branchId: stayIdentifierSchema,
    brandId: stayIdentifierSchema,
    roomTypeId: stayIdentifierSchema,
    terms: billingAgreementTermsSchema,
  })
  .strict();
type Input = z.infer<typeof inputSchema>;
const policyRow = z.object({
  id: stayIdentifierSchema,
  brandId: stayIdentifierSchema.nullable(),
  branchId: stayIdentifierSchema.nullable(),
  roomTypeId: stayIdentifierSchema.nullable(),
  isCurrent: z.literal(true),
  policy: billingPolicySchema,
});
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Admission agreement data unavailable');
}
function conflict(): never {
  throw new DomainError(
    'CONFLICT',
    409,
    'Billing policy or approved charges changed; reload the admission agreement',
  );
}
// RENT-003 / FIN-004: caller holds live stay/rent/finance authority and active
// hierarchy/type locks. Manual prices remain explicitly agreed, never inferred.
// Current policy and every selected catalogue snapshot must bind before writes.
export async function validateResidentAdmissionTerms(tx: PostingTransaction, value: unknown) {
  const input = inputSchema.parse(value);
  const raw = await tx
    .select()
    .from(billingPolicies)
    .where(
      and(
        eq(billingPolicies.isCurrent, true),
        or(
          and(isNull(billingPolicies.brandId), isNull(billingPolicies.branchId)),
          eq(billingPolicies.brandId, input.brandId),
          and(
            eq(billingPolicies.branchId, input.branchId),
            or(
              isNull(billingPolicies.roomTypeId),
              eq(billingPolicies.roomTypeId, input.roomTypeId),
            ),
          ),
        ),
      ),
    )
    .limit(5)
    .for('share');
  const parsed = z.array(policyRow).max(4).safeParse(raw);
  if (!parsed.success) unavailable();
  const ranked = new Map<number, z.infer<typeof policyRow>>();
  for (const row of parsed.data) {
    const rank = policyRank(input, row);
    if (ranked.has(rank)) unavailable();
    ranked.set(rank, row);
  }
  const effective = ranked.get(3) ?? ranked.get(2) ?? ranked.get(1) ?? ranked.get(0);
  if (!effective) conflict();
  if (
    effective.id !== input.terms.policyVersionId ||
    JSON.stringify(effective.policy) !== JSON.stringify(input.terms.policy)
  )
    conflict();
  await validateCatalog(tx, input);
  return input.terms;
}
function policyRank(input: Input, row: z.infer<typeof policyRow>) {
  if (row.roomTypeId !== null) {
    if (
      row.roomTypeId !== input.roomTypeId ||
      row.branchId !== input.branchId ||
      row.brandId !== null
    )
      unavailable();
    return 3;
  }
  if (row.branchId !== null) {
    if (row.branchId !== input.branchId || row.brandId !== null) unavailable();
    return 2;
  }
  if (row.brandId !== null) {
    if (row.brandId !== input.brandId) unavailable();
    return 1;
  }
  return 0;
}
async function validateCatalog(tx: PostingTransaction, input: Input) {
  if (!input.terms.catalog.length) return;
  const requested = input.terms.catalog;
  const rows = await tx
    .select()
    .from(residentChargeCatalog)
    .where(
      and(
        eq(residentChargeCatalog.branchId, input.branchId),
        inArray(
          residentChargeCatalog.id,
          requested.map((entry) => entry.catalogId),
        ),
        isNull(residentChargeCatalog.archivedAt),
      ),
    )
    .limit(33)
    .for('share');
  if (rows.length !== requested.length) conflict();
  const snapshots = new Map<string, z.infer<typeof billingCatalogSnapshotSchema>>();
  for (const row of rows) {
    if (row.branchId !== input.branchId || row.archivedAt !== null || snapshots.has(row.id))
      unavailable();
    const entry = projectCatalog(row);
    if (!requested.some((value) => value.catalogId === entry.catalogId)) unavailable();
    snapshots.set(entry.catalogId, entry);
  }
  for (const entry of requested)
    if (JSON.stringify(snapshots.get(entry.catalogId)) !== JSON.stringify(entry)) conflict();
}
function projectCatalog(row: typeof residentChargeCatalog.$inferSelect) {
  try {
    return billingCatalogSnapshotSchema.parse({
      catalogId: row.id,
      code: row.code,
      name: row.name,
      unitLabel: row.unitLabel,
      unitAmountPaisa: moneyToJson(money(row.unitAmountPaisa)),
    });
  } catch {
    unavailable();
  }
}
