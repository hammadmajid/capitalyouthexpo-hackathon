import { and, eq, inArray, sql } from 'drizzle-orm';
import { transportRoutes, transportSubscriptions, type Database } from '@hsm/db';
import {
  DomainError,
  stayIdentifierSchema,
  transportRouteInputSchema,
  transportRouteSchema,
  transportRouteUpdateSchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { canReadBranchFinance, lockOwnStay, lockStaffScope } from './scope.js';
import { requirePublicBranch } from './public-branch.js';
import {
  agreementTransportRoutes,
  checkedDestinations,
  derivedLists,
  hasLiveRiders,
  listRoutes,
  readRoute,
  replaceChildren,
  routeComplete,
  routeHasRiders,
} from './transport-route-data.js';
import { transportOverview } from './transport-overview.js';
import { karachiToday } from './dates.js';
export { projectRoute } from './transport-route-data.js';
const id = stayIdentifierSchema;
const GRANTS = ['listing_edit', 'pricing_edit'] as const;
type Input = z.infer<typeof transportRouteInputSchema>;
// SERV-002: destinations and trips are versioned and audited with the route.
export class TransportRouteService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  staffList(actor: Actor, branchId: unknown) {
    const branch = id.parse(branchId);
    return this.database.transaction(async (tx) => {
      await lockStaffScope(tx, actor, branch, [], this.clock);
      return listRoutes(tx, branch, { activeOnly: false, completeOnly: false });
    });
  }
  overview(actor: Actor, branchId: unknown) {
    const branch = id.parse(branchId);
    return this.database.transaction(async (tx) => {
      const scope = await lockStaffScope(tx, actor, branch, [], this.clock);
      return transportOverview(tx, branch, this.clock(), await canReadBranchFinance(tx, scope));
    });
  }
  ownList(actor: Actor, stayId: unknown) {
    const stay = id.parse(stayId);
    return this.database.transaction(async (tx) => {
      const own = await lockOwnStay(tx, actor, stay, this.clock, true);
      return listRoutes(tx, own.stay.branchId, {
        activeOnly: true,
        completeOnly: true,
        agreementRoutes: await agreementTransportRoutes(tx, own.stay.branchId, stay),
      });
    });
  }
  publicList(branchId: unknown) {
    const branch = id.parse(branchId);
    return this.database.transaction(async (tx) => {
      await requirePublicBranch(tx, branch);
      return listRoutes(tx, branch, { activeOnly: true, completeOnly: true });
    });
  }
  create(actor: Actor, key: unknown, branchId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      input = transportRouteInputSchema.parse(body);
    return this.command(actor, key, 'POST transport route', 201, { branch }, input, async (tx) => {
      const now = this.clock();
      const scope = await lockStaffScope(tx, actor, branch, GRANTS, this.clock);
      const destinations = await checkedDestinations(tx, input.destinations);
      const values = this.values(input);
      if (input.status !== 'inactive' && !routeComplete(values, destinations.length))
        throw new DomainError('VALIDATION_FAILED', 422, 'Add a destination');
      const [row] = await tx
        .insert(transportRoutes)
        .values({
          branchId: branch,
          ...values,
          monthlyChargePaisa: 0n,
          status: input.status ?? 'active',
          version: 1,
          createdByUserId: actor.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) throw new DomainError('INTERNAL', 500, 'Route unavailable');
      await replaceChildren(tx, row, destinations, input.trips);
      const after = await readRoute(tx, row);
      await this.record(tx, scope, row.id, branch, 'transport.route.created', null, after, now);
      return after;
    });
  }
  update(actor: Actor, key: unknown, branchId: unknown, routeId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      route = id.parse(routeId),
      input = transportRouteUpdateSchema.parse(body);
    return this.command(
      actor,
      key,
      'PUT transport route',
      200,
      { branch, route },
      input,
      async (tx) => {
        const now = this.clock();
        const scope = await lockStaffScope(tx, actor, branch, GRANTS, this.clock);
        const [current] = await tx
          .select()
          .from(transportRoutes)
          .where(and(eq(transportRoutes.branchId, branch), eq(transportRoutes.id, route)))
          .for('update');
        if (!current) throw new DomainError('NOT_FOUND', 404, 'Route unavailable');
        if (current.version !== input.expectedVersion)
          throw new DomainError('CONFLICT', 409, 'The route changed; reload before saving');
        if (current.status === 'active' && input.status === 'inactive') {
          if (await hasLiveRiders(tx, branch, karachiToday(now))) {
            const { data } = await listRoutes(tx, branch, { activeOnly: true, completeOnly: true });
            if (!data.some((candidate) => candidate.id !== route))
              throw new DomainError(
                'CONFLICT',
                409,
                'End or decide subscriptions before archiving the last route',
              );
          }
          await this.moveRiders(tx, scope, branch, route, now);
        }
        const destinations = await checkedDestinations(tx, input.destinations);
        const values = this.values(input);
        if (input.status === 'active' && !routeComplete(values, destinations.length))
          throw new DomainError('VALIDATION_FAILED', 422, 'Add a destination');
        const before = await readRoute(tx, current);
        const [row] = await tx
          .update(transportRoutes)
          .set({
            ...values,
            status: input.status,
            version: current.version + 1,
            updatedAt: now,
          })
          .where(eq(transportRoutes.id, route))
          .returning();
        if (!row) throw new DomainError('INTERNAL', 500, 'Route unavailable');
        await replaceChildren(tx, row, destinations, input.trips);
        const after = await readRoute(tx, row);
        await this.record(tx, scope, row.id, branch, 'transport.route.updated', before, after, now);
        return after;
      },
    );
  }
  private async moveRiders(
    tx: Transaction,
    scope: Awaited<ReturnType<typeof lockStaffScope>>,
    branch: string,
    route: string,
    now: Date,
  ) {
    if (!(await routeHasRiders(tx, branch, route))) return;
    const { data } = await listRoutes(tx, branch, { activeOnly: true, completeOnly: true });
    const next = data.find((item) => item.id !== route);
    if (!next)
      throw new DomainError('CONFLICT', 409, 'End or decide this route’s subscriptions first');
    const moved = await tx
      .update(transportSubscriptions)
      .set({
        routeId: next.id,
        version: sql`${transportSubscriptions.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(transportSubscriptions.branchId, branch),
          eq(transportSubscriptions.routeId, route),
          inArray(transportSubscriptions.status, ['requested', 'active']),
        ),
      )
      .returning({ id: transportSubscriptions.id });
    for (const row of moved)
      await this.audit.hostel(tx, {
        organizationId: scope.organizationId,
        branchId: branch,
        actorUserId: scope.actorUserId,
        actorRole: scope.actorRole,
        action: 'transport.subscription.route_moved',
        targetType: 'transport_subscription',
        targetId: row.id,
        before: { routeId: route },
        after: { routeId: next.id },
        createdAt: now,
      });
  }
  private values(input: Input) {
    const lists = derivedLists(input, input.stopPoints, input.trips);
    return {
      name: input.name,
      description: input.description ?? null,
      ...lists,
    };
  }
  private command<T>(
    actor: Actor,
    key: unknown,
    endpoint: string,
    status: 200 | 201,
    scope: Record<string, string>,
    input: T,
    work: (tx: Transaction) => Promise<unknown>,
  ) {
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint, status },
        scope,
        input,
        transportRouteSchema,
        async (tx) =>
          Boolean(await lockStaffScope(tx, actor, scope.branch ?? '', GRANTS, this.clock)),
        async () => work(requireTransaction()),
      )
      .catch(inventoryFailure);
  }
  private async record(
    tx: Transaction,
    scope: Awaited<ReturnType<typeof lockStaffScope>>,
    routeId: string,
    branchId: string,
    action: string,
    before: unknown,
    after: unknown,
    now: Date,
  ) {
    await this.audit.hostel(tx, {
      organizationId: scope.organizationId,
      branchId,
      actorUserId: scope.actorUserId,
      actorRole: scope.actorRole,
      action,
      targetType: 'transport_route',
      targetId: routeId,
      before: before as Record<string, unknown> | null,
      after: after as Record<string, unknown>,
      createdAt: now,
    });
  }
}
