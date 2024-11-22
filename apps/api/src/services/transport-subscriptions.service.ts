import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import {
  stays,
  residents,
  syncTransportBilling,
  transportRoutes,
  transportSubscriptions,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  type InventoryPermission,
  money,
  moneyToJson,
  stayIdentifierSchema,
  transportDecisionInputSchema,
  transportRequestInputSchema,
  transportResidentActionSchema,
  transportSubscriptionPageSchema,
  transportSubscriptionQuerySchema,
  transportSubscriptionSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { karachiToday } from './dates.js';
import {
  OPERATIONAL_STAY_STATES,
  lockOwnStay,
  lockStaffScope,
  type StaffScope,
  replayAuthorizer,
  canReadBranchFinance,
  holdsGrants,
} from './scope.js';
import { branchOwner, notify } from './notify.js';
import { agreementTransportRoutes, listRoutes } from './transport-route-data.js';
import { transportBillingBySubscription } from './transport-billing-view.js';
const id = stayIdentifierSchema;
const DECIDE = ['stay_manage', 'rent_manage'] as const;
type Row = typeof transportSubscriptions.$inferSelect;
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
const columns = { subscription: transportSubscriptions, routeName: transportRoutes.name };
const liveRank = sql<number>`case when ${transportSubscriptions.status} in ('requested', 'active') then 1 else 0 end`;

async function ownCursor(tx: Transaction, stay: string, cursor: string) {
  const [row] = await tx
    .select({ rank: liveRank })
    .from(transportSubscriptions)
    .where(and(eq(transportSubscriptions.stayId, stay), eq(transportSubscriptions.id, cursor)));
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Subscription unavailable');
  return or(
    lt(liveRank, row.rank),
    and(eq(liveRank, row.rank), lt(transportSubscriptions.id, cursor)),
  );
}
function project(row: { subscription: Row; routeName: string }) {
  const s = row.subscription;
  return transportSubscriptionSchema.parse({
    id: s.id,
    branchId: s.branchId,
    stayId: s.stayId,
    routeId: s.routeId,
    routeName: row.routeName,
    status: s.status,
    monthlyChargePaisa: moneyToJson(money(s.monthlyChargePaisa)),
    effectiveFrom: s.effectiveFrom,
    effectiveTo: s.effectiveTo,
    endRequestedAt: s.endRequestedAt?.toISOString() ?? null,
    reason: s.reason,
    version: s.version,
    createdAt: s.createdAt.toISOString(),
  });
}
async function readOne(tx: Pick<Transaction, 'select'>, subscriptionId: string) {
  const [row] = await tx
    .select(columns)
    .from(transportSubscriptions)
    .innerJoin(transportRoutes, eq(transportRoutes.id, transportSubscriptions.routeId))
    .where(eq(transportSubscriptions.id, subscriptionId));
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Subscription unavailable');
  return project(row);
}
// SERV-002 / p.32: residents ask; staff with stay_manage + rent_manage decide with an explicit
// effective date, which the shared billing schedule turns into separate transport charges.
export class TransportSubscriptionService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  ownList(actor: Actor, stayId: unknown, query: unknown = {}) {
    const stay = id.parse(stayId);
    const input = transportSubscriptionQuerySchema
      .omit({ status: true, stayId: true })
      .parse(query);
    return this.database.transaction(async (tx) => {
      await lockOwnStay(tx, actor, stay, this.clock, false);
      const cursor = input.cursor ? await ownCursor(tx, stay, input.cursor) : undefined;
      const rows = await tx
        .select(columns)
        .from(transportSubscriptions)
        .innerJoin(transportRoutes, eq(transportRoutes.id, transportSubscriptions.routeId))
        .where(and(eq(transportSubscriptions.stayId, stay), cursor))
        .orderBy(desc(liveRank), desc(transportSubscriptions.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return transportSubscriptionPageSchema.parse({
        data: page.map(project),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.subscription.id ?? null) : null,
      });
    });
  }
  staffList(actor: Actor, branchId: unknown, query: unknown) {
    const branch = id.parse(branchId),
      input = transportSubscriptionQuerySchema.parse(query);
    return this.database.transaction(async (tx) => {
      // Readers: finance_view (with invoices) or the decision grants (requests, no amounts).
      const scope = await lockStaffScope(tx, actor, branch, [], this.clock);
      const finance = await canReadBranchFinance(tx, scope);
      if (!finance && !(await holdsGrants(tx, scope, DECIDE)))
        throw new DomainError('FORBIDDEN', 403, 'Transport riders need finance or decision access');
      const rows = await tx
        .select({ ...columns, residentName: residents.displayName })
        .from(transportSubscriptions)
        .innerJoin(transportRoutes, eq(transportRoutes.id, transportSubscriptions.routeId))
        .innerJoin(
          stays,
          and(
            eq(stays.id, transportSubscriptions.stayId),
            eq(stays.branchId, transportSubscriptions.branchId),
          ),
        )
        .innerJoin(residents, eq(residents.id, stays.residentId))
        .where(
          and(
            eq(transportSubscriptions.branchId, branch),
            input.status ? eq(transportSubscriptions.status, input.status) : undefined,
            input.stayId ? eq(transportSubscriptions.stayId, input.stayId) : undefined,
            input.cursor ? lt(transportSubscriptions.id, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(transportSubscriptions.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      const billing = finance
        ? await transportBillingBySubscription(
            tx,
            branch,
            page.filter((row) => row.subscription.effectiveFrom).map((row) => row.subscription.id),
            karachiToday(this.clock()),
          )
        : new Map();
      return transportSubscriptionPageSchema.parse({
        data: page.map((row) => ({
          ...project(row),
          residentName: row.residentName,
          billing: billing.get(row.subscription.id) ?? null,
        })),
        nextCursor: rows.length > input.limit ? (page.at(-1)?.subscription.id ?? null) : null,
      });
    });
  }
  request(actor: Actor, key: unknown, stayId: unknown, body: unknown) {
    const stay = id.parse(stayId),
      input = transportRequestInputSchema.parse(body);
    return this.command(actor, key, 'POST transport request', 201, { stay }, input, async (tx) => {
      const own = await lockOwnStay(tx, actor, stay, this.clock, true);
      const agreementRoutes = await agreementTransportRoutes(tx, own.stay.branchId, stay);
      if (agreementRoutes.size) conflict('Transport is already included in your agreed rent');
      const available = await listRoutes(tx, own.stay.branchId, {
        activeOnly: true,
        completeOnly: true,
        agreementRoutes,
        lockOffer: true,
      });
      if (input.routeId && !available.data.some((route) => route.id === input.routeId))
        throw new DomainError('NOT_FOUND', 404, 'Route unavailable');
      const offer = available.offer;
      const anchor =
        available.data.find((route) => route.id === input.routeId) ?? available.data[0];
      if (!anchor || offer?.mode !== 'separate')
        conflict('A monthly transport subscription is unavailable');
      if (offer.monthlyChargePaisa !== input.monthlyChargePaisa)
        conflict('The monthly charge changed; review the new price before asking again');
      const [route] = await tx
        .select()
        .from(transportRoutes)
        .where(
          and(
            eq(transportRoutes.branchId, own.stay.branchId),
            eq(transportRoutes.id, anchor.id),
            eq(transportRoutes.status, 'active'),
          ),
        )
        .for('share');
      if (!route) throw new DomainError('NOT_FOUND', 404, 'Route unavailable');
      const now = this.clock();
      const [row] = await tx
        .insert(transportSubscriptions)
        .values({
          branchId: own.stay.branchId,
          stayId: stay,
          routeId: route.id,
          status: 'requested',
          monthlyChargePaisa: BigInt(offer.monthlyChargePaisa),
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) conflict('You already have a transport request or subscription for this Stay');
      const owner = await branchOwner(tx, own.stay.branchId);
      if (owner) await notify(tx, owner, 'resident.transport_requested', row.id, now);
      return readOne(tx, row.id);
    });
  }
  resident(
    actor: Actor,
    key: unknown,
    stayId: unknown,
    subscriptionId: unknown,
    act: 'withdraw' | 'end',
    body: unknown,
  ) {
    const stay = id.parse(stayId),
      subscription = id.parse(subscriptionId),
      input = transportResidentActionSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST transport ' + act,
      200,
      { stay, subscription },
      input,
      async (tx) => {
        await lockOwnStay(tx, actor, stay, this.clock, true);
        const row = await this.lockRow(tx, subscription, input.expectedVersion, { stayId: stay });
        const now = this.clock();
        if (act === 'withdraw') {
          if (row.status !== 'requested') conflict('Only a pending request can be withdrawn');
          await this.write(tx, row, { status: 'withdrawn' }, now);
        } else {
          if (row.status !== 'active' || row.endRequestedAt) conflict('Nothing to end');
          await this.write(tx, row, { endRequestedAt: now }, now);
          const owner = await branchOwner(tx, row.branchId);
          if (owner) await notify(tx, owner, 'resident.transport_requested', row.id + ':end', now);
        }
        return readOne(tx, row.id);
      },
    );
  }
  decide(actor: Actor, key: unknown, branchId: unknown, subscriptionId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      subscription = id.parse(subscriptionId),
      input = transportDecisionInputSchema.parse(body);
    return this.command(
      actor,
      key,
      'POST transport decision',
      200,
      { branch, subscription },
      input,
      async (tx) => {
        const scope = await lockStaffScope(tx, actor, branch, DECIDE, this.clock);
        const [found] = await tx
          .select({ stayId: transportSubscriptions.stayId })
          .from(transportSubscriptions)
          .where(
            and(
              eq(transportSubscriptions.branchId, branch),
              eq(transportSubscriptions.id, subscription),
            ),
          );
        if (!found) throw new DomainError('NOT_FOUND', 404, 'Subscription unavailable');
        const [stay] = await tx
          .select()
          .from(stays)
          .where(and(eq(stays.branchId, branch), eq(stays.id, found.stayId)))
          .for('update');
        const row = await this.lockRow(tx, subscription, input.expectedVersion, {
          branchId: branch,
        });
        const now = this.clock(),
          today = karachiToday(now);
        if (input.decision === 'reject') {
          if (row.status !== 'requested') conflict('Only a pending request can be rejected');
          await this.write(
            tx,
            row,
            { status: 'rejected', decidedByUserId: actor.userId, reason: input.reason },
            now,
          );
        } else {
          if (!stay || !OPERATIONAL_STAY_STATES.some((state) => state === stay.state))
            conflict('Transport changes need an active Stay');
          const date = input.decision === 'approve' ? input.effectiveFrom : input.effectiveTo;
          if (date < today) conflict('The effective date cannot be in the past');
          if (input.decision === 'approve') {
            if (row.status !== 'requested') conflict('Only a pending request can be approved');
            if (date < stay.moveInDate) conflict('Transport cannot start before the Stay');
            await this.write(
              tx,
              row,
              { status: 'active', effectiveFrom: date, decidedByUserId: actor.userId },
              now,
            );
          } else {
            if (row.status !== 'active' || !row.effectiveFrom)
              conflict('Only an active subscription can end');
            if (date <= row.effectiveFrom) conflict('The end must be after the start');
            await this.write(tx, row, { status: 'ended', effectiveTo: date }, now);
          }
          await syncTransportBilling(
            tx,
            { ...scope, stayId: row.stayId },
            { changedOn: date, activate: input.decision === 'approve' },
            now,
          );
        }
        await this.record(tx, scope, row, input.decision, now);
        if (stay?.userId)
          await notify(
            tx,
            stay.userId,
            'resident.transport_decided',
            row.id + ':' + input.decision,
            now,
          );
        return readOne(tx, row.id);
      },
      DECIDE,
    );
  }
  private command<T>(
    actor: Actor,
    key: unknown,
    endpoint: string,
    status: 200 | 201,
    scope: Record<string, string>,
    input: T,
    work: (tx: Transaction) => Promise<unknown>,
    grants: readonly InventoryPermission[] = [],
  ) {
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint, status },
        scope,
        input,
        transportSubscriptionSchema,
        replayAuthorizer(actor, this.clock, scope, grants),
        async () => work(requireTransaction()),
      )
      .catch(inventoryFailure);
  }
  private async lockRow(
    tx: Transaction,
    subscriptionId: string,
    expectedVersion: number,
    scope: { stayId?: string; branchId?: string },
  ) {
    const [row] = await tx
      .select()
      .from(transportSubscriptions)
      .where(eq(transportSubscriptions.id, subscriptionId))
      .for('update');
    if (
      !row ||
      (scope.stayId !== undefined && row.stayId !== scope.stayId) ||
      (scope.branchId !== undefined && row.branchId !== scope.branchId)
    )
      throw new DomainError('NOT_FOUND', 404, 'Subscription unavailable');
    if (row.version !== expectedVersion) conflict('This request changed; reload before continuing');
    return row;
  }
  private async write(tx: Transaction, row: Row, change: Partial<Row>, now: Date) {
    await tx
      .update(transportSubscriptions)
      .set({ ...change, version: row.version + 1, updatedAt: now })
      .where(eq(transportSubscriptions.id, row.id));
  }
  private async record(tx: Transaction, scope: StaffScope, row: Row, decision: string, now: Date) {
    await this.audit.hostel(tx, {
      organizationId: scope.organizationId,
      branchId: row.branchId,
      actorUserId: scope.actorUserId,
      actorRole: scope.actorRole,
      action: 'transport.subscription.' + decision,
      targetType: 'transport_subscription',
      targetId: row.id,
      after: await readOne(tx, row.id),
      createdAt: now,
    });
  }
}
