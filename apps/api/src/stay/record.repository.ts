import {
  agreementDigest,
  project as projectAcceptance,
} from './agreement-acceptance.repository.js';
import { and, desc, eq, lt, inArray } from 'drizzle-orm';
import {
  branches,
  agreementAcceptances,
  roomTypes,
  rooms,
  seats,
  stayAgreements,
  stayAssignments,
  stayHistory,
  stays,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  STAY_RECORD_LIMIT,
  stayRecordSchema,
  type StayRecordQuery,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
const fetchLimit = STAY_RECORD_LIMIT + 1;
function unavailable(): never {
  throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
}
async function agreements(tx: Transaction, branchId: string, stayId: string, before?: number) {
  return tx
    .select()
    .from(stayAgreements)
    .where(
      and(
        eq(stayAgreements.branchId, branchId),
        eq(stayAgreements.stayId, stayId),
        before === undefined ? undefined : lt(stayAgreements.version, before),
      ),
    )
    .orderBy(desc(stayAgreements.version))
    .limit(fetchLimit);
}
async function assignments(tx: Transaction, branchId: string, stayId: string) {
  return tx
    .select({
      id: stayAssignments.id,
      roomTypeId: stayAssignments.roomTypeId,
      roomTypeName: roomTypes.name,
      roomId: stayAssignments.roomId,
      roomLabel: rooms.label,
      bedId: stayAssignments.seatId,
      bedLabel: seats.label,
      startedAt: stayAssignments.startedAt,
      endedAt: stayAssignments.endedAt,
    })
    .from(stayAssignments)
    .innerJoin(
      rooms,
      and(eq(rooms.id, stayAssignments.roomId), eq(rooms.branchId, stayAssignments.branchId)),
    )
    .innerJoin(roomTypes, eq(roomTypes.id, stayAssignments.roomTypeId))
    .leftJoin(seats, eq(seats.id, stayAssignments.seatId))
    .where(and(eq(stayAssignments.branchId, branchId), eq(stayAssignments.stayId, stayId)))
    .orderBy(desc(stayAssignments.startedAt), desc(stayAssignments.id))
    .limit(fetchLimit);
}
async function history(tx: Transaction, branchId: string, stayId: string) {
  return tx
    .select({
      id: stayHistory.id,
      previousState: stayHistory.previousState,
      nextState: stayHistory.nextState,
      reasonCode: stayHistory.reasonCode,
      createdAt: stayHistory.createdAt,
    })
    .from(stayHistory)
    .where(and(eq(stayHistory.branchId, branchId), eq(stayHistory.stayId, stayId)))
    .orderBy(desc(stayHistory.createdAt), desc(stayHistory.id))
    .limit(fetchLimit);
}
// STAY-002 / RES-005: one Stay's agreement, assignment and lifecycle lineage, newest first.
async function record(
  tx: Transaction,
  stay: { id: string; branchId: string },
  query: StayRecordQuery,
) {
  const [branch] = await tx
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.id, stay.branchId));
  if (!branch) throw new DomainError('INTERNAL', 500, 'Stay branch unavailable');
  const [agreementRows, assignmentRows, historyRows] = [
    await agreements(tx, stay.branchId, stay.id, query.beforeAgreementVersion),
    await assignments(tx, stay.branchId, stay.id),
    await history(tx, stay.branchId, stay.id),
  ];
  const acknowledgements = await tx
    .select()
    .from(agreementAcceptances)
    .where(
      and(
        eq(agreementAcceptances.branchId, stay.branchId),
        eq(agreementAcceptances.stayId, stay.id),
        inArray(
          agreementAcceptances.agreementId,
          agreementRows.slice(0, STAY_RECORD_LIMIT).map((row) => row.id),
        ),
      ),
    )
    .orderBy(desc(agreementAcceptances.acceptedAt), desc(agreementAcceptances.id))
    .limit(fetchLimit);
  const result = stayRecordSchema.safeParse({
    stayId: stay.id,
    branch,
    ...(agreementRows.length > STAY_RECORD_LIMIT
      ? {
          nextAgreementBeforeVersion: agreementRows[STAY_RECORD_LIMIT - 1]?.version,
        }
      : {}),
    agreements: agreementRows.slice(0, STAY_RECORD_LIMIT).map((row) => ({
      id: row.id,
      version: row.version,
      effectiveFrom: row.effectiveFrom,
      terms: row.termsSnapshot,
      termsDigest: agreementDigest(row.termsSnapshot),
      acknowledgements: acknowledgements
        .filter((item) => item.agreementId === row.id)
        .slice(0, STAY_RECORD_LIMIT)
        .map(projectAcceptance),
      fromBooking: row.bookingSnapshot !== null,
      createdAt: row.createdAt.toISOString(),
    })),
    assignments: assignmentRows.slice(0, STAY_RECORD_LIMIT).map((row) => ({
      ...row,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
    })),
    history: historyRows.slice(0, STAY_RECORD_LIMIT).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    truncated: [agreementRows, assignmentRows, historyRows, acknowledgements].some(
      (rows) => rows.length > STAY_RECORD_LIMIT,
    ),
  });
  if (!result.success) throw new DomainError('INTERNAL', 500, 'Stay record unavailable');
  return result.data;
}
export class StayRecordRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  staff(actor: Actor, branchId: string, stayId: string, query: StayRecordQuery = {}) {
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      await lockInventoryScope(tx, actor, branchId, 'stay_manage');
      await lockActor(tx, actor, this.clock);
      const [stay] = await tx
        .select({ id: stays.id, branchId: stays.branchId })
        .from(stays)
        .where(and(eq(stays.branchId, branchId), eq(stays.id, stayId)));
      return stay ? record(tx, stay, query) : unavailable();
    });
  }
  // CHG-012: a live account reads only Stays explicitly linked to it.
  own(actor: Actor, stayId: string, query: StayRecordQuery = {}) {
    return this.database.transaction(async (tx) => {
      await lockActor(tx, actor, this.clock);
      const [stay] = await tx
        .select({ id: stays.id, branchId: stays.branchId })
        .from(stays)
        .where(and(eq(stays.userId, actor.userId), eq(stays.id, stayId)));
      return stay ? record(tx, stay, query) : unavailable();
    });
  }
}
