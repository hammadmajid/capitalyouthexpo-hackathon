import { and, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { z } from 'zod';
import {
  DomainError,
  residentReferenceInputSchema,
  stayIdentifierSchema,
  stayPrivateText,
} from '@hsm/contracts';
import { residents, hostelAuditLog } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { cnicColumns, protectedCnicSchema } from './resident-cnic.js';
export const admissionActorScopeSchema = z
  .object({
    organizationId: stayIdentifierSchema,
    branchId: stayIdentifierSchema,
    actorUserId: stayIdentifierSchema,
    actorRole: z.enum(['owner', 'manager']),
  })
  .strict();
const inputSchema = z
  .object({
    scope: admissionActorScopeSchema,
    resident: residentReferenceInputSchema,
    expectedUserId: stayIdentifierSchema.nullable(),
    cnic: protectedCnicSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.resident.kind !== 'new' || value.expectedUserId === null,
    'A new manual relationship cannot invent an account link',
  );
const storedResident = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  userId: stayIdentifierSchema.nullable(),
  displayName: stayPrivateText(120),
  archivedAt: z.date().nullable(),
});
type Input = z.infer<typeof inputSchema>;
// RES-001/003 / STAY-001: caller proves live admission authority, sorted participant
// identity locks and active hierarchy, and owns authorized idempotent admission.
// expectedUserId is the server preflight binding, never a public request field.
// No contact-based lookup, login/User creation, implicit link or unarchive exists.
export async function resolveResidentAdmissionParty(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
) {
  const input = inputSchema.parse(value),
    now = z.date().parse(clock);
  if (input.resident.kind === 'existing') return existing(tx, input, input.resident.residentId);
  const id = v7(),
    profile = input.resident.profile;
  await tx.insert(residents).values({
    id,
    branchId: input.scope.branchId,
    userId: null,
    displayName: profile.displayName,
    phone: profile.phone ?? null,
    email: profile.email ?? null,
    ...cnicColumns(input.cnic ?? null),
    createdByUserId: input.scope.actorUserId,
    createdAt: now,
    updatedAt: now,
  });
  await auditCreation(tx, input, id, now);
  return {
    residentId: id,
    branchId: input.scope.branchId,
    userId: null,
    displayName: profile.displayName,
  };
}
async function existing(tx: PostingTransaction, input: Input, residentId: string) {
  const [raw] = await tx
    .select()
    .from(residents)
    .where(and(eq(residents.branchId, input.scope.branchId), eq(residents.id, residentId)))
    .for('update');
  if (!raw) throw new DomainError('NOT_FOUND', 404, 'Resident unavailable');
  const parsed = storedResident.safeParse(raw);
  if (!parsed.success)
    throw new DomainError('INTERNAL', 500, 'Admission resident data unavailable');
  const resident = parsed.data;
  if (resident.id !== residentId || resident.branchId !== input.scope.branchId)
    throw new DomainError('INTERNAL', 500, 'Admission resident scope unavailable');
  if (resident.archivedAt !== null) throw new DomainError('CONFLICT', 409, 'Resident unavailable');
  if (resident.userId !== input.expectedUserId)
    throw new DomainError('CONFLICT', 409, 'Resident account link changed; reload admission');
  return {
    residentId: resident.id,
    branchId: resident.branchId,
    userId: resident.userId,
    displayName: resident.displayName,
  };
}
async function auditCreation(tx: PostingTransaction, input: Input, residentId: string, now: Date) {
  await tx.insert(hostelAuditLog).values({
    organizationId: input.scope.organizationId,
    branchId: input.scope.branchId,
    actorUserId: input.scope.actorUserId,
    actorRole: input.scope.actorRole,
    action: 'resident.relationship.created',
    targetType: 'resident',
    targetId: residentId,
    after: { residentId, accountLinked: false },
    createdAt: now,
  });
}
