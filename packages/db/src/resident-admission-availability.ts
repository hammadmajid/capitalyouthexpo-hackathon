import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  databaseDateSchema,
  DomainError,
  inventoryTargetSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { inventoryClaims } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
const inputSchema = z
  .object({
    branchId: stayIdentifierSchema,
    target: inventoryTargetSchema,
    expectedLeaveDate: databaseDateSchema.nullable(),
  })
  .strict();
// STAY-001 / RES-004 / ACC-001: caller holds authorized identity/hierarchy and the
// canonical private target locks, and expires reservations before claim creation.
// This is actual admission today, not a future quote or a reservation handoff.
// Every unclosed physical assignment blocks check-in regardless of its planned end.
export async function requireResidentAdmissionAvailable(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
) {
  const input = inputSchema.parse(value),
    now = z.date().parse(clock);
  const today = databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
  if (input.expectedLeaveDate !== null && input.expectedLeaveDate <= today)
    throw new DomainError(
      'CONFLICT',
      409,
      'Actual admission requires a future departure or an agreed open-ended period',
    );
  const conflicts = await tx
    .select({ id: inventoryClaims.id })
    .from(inventoryClaims)
    .where(
      and(
        eq(inventoryClaims.branchId, input.branchId),
        eq(inventoryClaims.roomId, input.target.roomId),
        isNull(inventoryClaims.releasedAt),
        or(isNull(inventoryClaims.expiresAt), gt(inventoryClaims.expiresAt, now)),
        input.target.kind === 'bed'
          ? or(isNull(inventoryClaims.seatId), eq(inventoryClaims.seatId, input.target.bedId))
          : undefined,
        or(
          isNotNull(inventoryClaims.assignmentId),
          and(
            input.expectedLeaveDate === null
              ? undefined
              : lt(inventoryClaims.moveInDate, input.expectedLeaveDate),
            or(isNull(inventoryClaims.moveOutDate), gt(inventoryClaims.moveOutDate, today)),
          ),
        ),
      ),
    )
    .limit(1);
  if (conflicts.length)
    throw new DomainError(
      'CONFLICT',
      409,
      'Inventory is reserved or actually occupied; resolve the conflict before admission',
    );
  return { admittedOn: today };
}
