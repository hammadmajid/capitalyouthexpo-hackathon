import { and, eq } from 'drizzle-orm';
import {
  branches,
  checkoutStay,
  extendStay,
  organizations,
  readPostCheckoutActivity,
  readStaySettlement,
  recordResidentFundMovement,
  stayFinalStatements,
  transferStay,
  type Database,
} from '@hsm/db';
import {
  DomainError,
  databaseDateSchema,
  staySettlementSchema,
  type FundMovementInput,
  type InventoryPermission,
} from '@hsm/contracts';
import type { z } from 'zod';
import type {
  stayCheckoutInputSchema,
  stayExtensionInputSchema,
  stayTransferInputSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { lockFinancialReadStay } from './financial-read-scope.js';
function karachiToday(now: Date) {
  return databaseDateSchema.parse(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now),
  );
}
// CHG-010: every lifecycle act needs its explicit live grants; the Owner holds all.
export const LIFECYCLE_GRANTS = {
  transfer: ['stay_manage'],
  // P9-FIX-01/02/03: acts that change money also need the matching finance grants.
  repriced_transfer: ['stay_manage', 'rent_manage', 'finance_view'],
  extension: ['stay_manage', 'rent_manage'],
  checkout: ['finance_view', 'checkout_manage'],
  checkout_with_deposit: ['finance_view', 'checkout_manage', 'payment_record'],
  apply: ['finance_view', 'payment_record'],
  settle: ['finance_view', 'checkout_manage'],
} as const satisfies Record<string, readonly InventoryPermission[]>;
export type LifecycleAct = keyof typeof LIFECYCLE_GRANTS;
export class StayLifecycleRepository {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, branchId: string, act: LifecycleAct) {
    await lockActor(tx, actor, this.clock);
    let scope: Awaited<ReturnType<typeof lockInventoryScope>> | undefined;
    for (const grant of LIFECYCLE_GRANTS[act])
      scope = await lockInventoryScope(tx, actor, branchId, grant);
    await lockActor(tx, actor, this.clock);
    if (!scope) throw new DomainError('FORBIDDEN', 403, 'Lifecycle authority unavailable');
    return {
      organizationId: scope.organizationId,
      actorRole: scope.actorRole === 'owner' ? ('owner' as const) : ('manager' as const),
    };
  }
  private authorizer(actor: Actor, act: LifecycleAct) {
    return async (tx: Transaction, scope: { branchId: string }) => {
      await this.authorize(tx, actor, scope.branchId, act);
    };
  }
  // Lock order matches admission: the command locks the branch inventory first and then
  // calls the authorizer, which proves the live grants. This read only labels the scope.
  private async scope(tx: Transaction, actor: Actor, branchId: string, stayId: string) {
    const [row] = await tx
      .select({ organizationId: branches.organizationId, ownerId: organizations.ownerUserId })
      .from(branches)
      .innerJoin(organizations, eq(organizations.id, branches.organizationId))
      .where(eq(branches.id, branchId));
    if (!row) throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
    return {
      organizationId: row.organizationId,
      actorRole: row.ownerId === actor.userId ? ('owner' as const) : ('manager' as const),
      branchId,
      stayId,
      actorUserId: actor.userId,
    };
  }
  async transfer(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    stayId: string,
    transfer: z.infer<typeof stayTransferInputSchema>,
  ) {
    const scope = await this.scope(tx, actor, branchId, stayId);
    const act = transfer.repricing ? 'repriced_transfer' : 'transfer';
    return transferStay(tx, { scope, transfer }, this.clock(), this.authorizer(actor, act));
  }
  async extend(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    stayId: string,
    extension: z.infer<typeof stayExtensionInputSchema>,
  ) {
    const scope = await this.scope(tx, actor, branchId, stayId);
    return extendStay(tx, { scope, extension }, this.clock(), this.authorizer(actor, 'extension'));
  }
  async checkout(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    stayId: string,
    checkout: z.infer<typeof stayCheckoutInputSchema>,
  ) {
    const scope = await this.scope(tx, actor, branchId, stayId);
    const act = checkout.applyAvailableDeposit ? 'checkout_with_deposit' : 'checkout';
    return checkoutStay(tx, { scope, checkout }, this.clock(), this.authorizer(actor, act));
  }
  // OUT-003/004: deposit/advance acts against an exact source payment (capacity enforced).
  async fundMovement(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    stayId: string,
    commandId: string,
    input: FundMovementInput,
  ) {
    const act = input.movement.kind.endsWith('_apply') ? 'apply' : 'settle';
    const scope = await this.authorize(tx, actor, branchId, act);
    return recordResidentFundMovement(
      tx,
      {
        scope: { branchId, stayId, actorUserId: actor.userId, actorRole: scope.actorRole },
        paymentId: input.paymentId,
        commandId,
        movement: input.movement,
      },
      this.clock(),
    );
  }
  // OUT-005: staff (finance_view) or the linked account read the live settlement.
  settlement(actor: Actor, stayId: string, branchId?: string) {
    return this.database.transaction(async (tx) => {
      const stay = await lockFinancialReadStay(tx, actor, stayId, this.clock, branchId);
      return readStaySettlement(tx, {
        branchId: stay.branchId,
        stayId,
        today: karachiToday(this.clock()),
      });
    });
  }
  // OUT-005: the statement frozen at checkout; 404 while the Stay is open.
  finalStatement(actor: Actor, stayId: string, branchId?: string) {
    return this.database.transaction(async (tx) => {
      const stay = await lockFinancialReadStay(tx, actor, stayId, this.clock, branchId);
      const [row] = await tx
        .select()
        .from(stayFinalStatements)
        .where(
          and(
            eq(stayFinalStatements.branchId, stay.branchId),
            eq(stayFinalStatements.stayId, stayId),
          ),
        );
      if (!row) throw new DomainError('NOT_FOUND', 404, 'No final statement yet');
      const snapshot = staySettlementSchema.safeParse(row.snapshot);
      if (!snapshot.success) throw new DomainError('INTERNAL', 500, 'Final statement unavailable');
      const afterCheckout = await readPostCheckoutActivity(tx, {
        branchId: stay.branchId,
        stayId,
        since: row.createdAt,
        today: karachiToday(this.clock()),
      });
      return {
        statementId: row.id,
        createdAt: row.createdAt.toISOString(),
        statement: snapshot.data,
        afterCheckout,
      };
    });
  }
}
