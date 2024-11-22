import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { stays, type Database } from '@hsm/db';
import {
  DomainError,
  fundMovementInputSchema,
  fundMovementResultSchema,
  stayCheckoutInputSchema,
  stayCheckoutResultSchema,
  stayExtensionInputSchema,
  stayExtensionResultSchema,
  stayIdentifierSchema,
  staySettlementSchema,
  stayTransferInputSchema,
  stayTransferResultSchema,
  stayFinalStatementResponseSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { IdempotencyRepository } from '../idempotency/repository.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockParticipants } from '../management/identity-lock.js';
import { inventoryFailure } from '../booking/errors.js';
import { StayLifecycleRepository, type LifecycleAct } from './lifecycle.repository.js';
const id = stayIdentifierSchema;
export const finalStatementSchema = stayFinalStatementResponseSchema;
export class StayLifecycleService {
  constructor(
    private readonly database: Database,
    private readonly repository: StayLifecycleRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  // Identity locks in the global order (actor, then the resident's account) before Stay locks.
  private async store(branchId: string, stayId: string) {
    const [stay] = await this.database
      .select({ userId: stays.userId })
      .from(stays)
      .where(and(eq(stays.branchId, branchId), eq(stays.id, stayId)));
    if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
    return new IdempotencyRepository(this.database, (tx, actor, now) =>
      stay.userId === null
        ? lockActor(tx, actor, () => now)
        : lockParticipants(tx, actor, stay.userId, () => now),
    );
  }
  private async run<T>(
    act: LifecycleAct,
    endpoint: string,
    actor: Actor,
    key: unknown,
    branchId: unknown,
    stayId: unknown,
    input: unknown,
    schema: z.ZodType<T>,
    work: (branch: string, stay: string) => Promise<T>,
  ) {
    const branch = id.parse(branchId),
      stay = id.parse(stayId);
    try {
      return await this.idempotency.withStore(await this.store(branch, stay)).execute(
        { actor, key: id.parse(key), endpoint, status: 200 },
        { branch, stay },
        input,
        schema,
        async (tx) => Boolean(await this.repository.authorize(tx, actor, branch, act)),
        () => work(branch, stay),
        // OUT-005: bounded invoice/source details plus up to 400 application
        // references exceed the default 64 KiB. Keep a finite checkout-only
        // budget; DTO validation, private-field rejection and replay scope remain.
        { maximumResponseBytes: endpoint === 'POST Stay checkout' ? 262144 : 65536 },
      );
    } catch (error) {
      if (error instanceof z.ZodError)
        throw new DomainError('INTERNAL', 500, 'Lifecycle response unavailable');
      return inventoryFailure(error);
    }
  }
  transfer(actor: Actor, key: unknown, branchId: unknown, stayId: unknown, body: unknown) {
    const input = stayTransferInputSchema.parse(body);
    return this.run(
      input.repricing ? 'repriced_transfer' : 'transfer',
      'POST Stay transfer',
      actor,
      key,
      branchId,
      stayId,
      input,
      stayTransferResultSchema,
      (b, s) => this.repository.transfer(requireTransaction(), actor, b, s, input),
    );
  }
  extend(actor: Actor, key: unknown, branchId: unknown, stayId: unknown, body: unknown) {
    const input = stayExtensionInputSchema.parse(body);
    return this.run(
      'extension',
      'POST Stay extension',
      actor,
      key,
      branchId,
      stayId,
      input,
      stayExtensionResultSchema,
      (b, s) => this.repository.extend(requireTransaction(), actor, b, s, input),
    );
  }
  checkout(actor: Actor, key: unknown, branchId: unknown, stayId: unknown, body: unknown) {
    const input = stayCheckoutInputSchema.parse(body);
    return this.run(
      input.applyAvailableDeposit ? 'checkout_with_deposit' : 'checkout',
      'POST Stay checkout',
      actor,
      key,
      branchId,
      stayId,
      input,
      stayCheckoutResultSchema,
      (b, s) => this.repository.checkout(requireTransaction(), actor, b, s, input),
    );
  }
  fundMovement(actor: Actor, key: unknown, branchId: unknown, stayId: unknown, body: unknown) {
    const input = fundMovementInputSchema.parse(body),
      act = input.movement.kind.endsWith('_apply') ? 'apply' : 'settle';
    return this.run(
      act,
      'POST Stay fund movement',
      actor,
      key,
      branchId,
      stayId,
      input,
      fundMovementResultSchema,
      (b, s) =>
        this.repository.fundMovement(requireTransaction(), actor, b, s, id.parse(key), input),
    );
  }
  async settlement(actor: Actor, stayId: unknown, branchId?: unknown) {
    return staySettlementSchema.parse(
      await this.repository.settlement(
        actor,
        id.parse(stayId),
        branchId === undefined ? undefined : id.parse(branchId),
      ),
    );
  }
  async finalStatement(actor: Actor, stayId: unknown, branchId?: unknown) {
    return finalStatementSchema.parse(
      await this.repository.finalStatement(
        actor,
        id.parse(stayId),
        branchId === undefined ? undefined : id.parse(branchId),
      ),
    );
  }
}
export function stayLifecycleService(
  database: Database,
  idempotency: IdempotencyService,
  clock: () => Date = () => new Date(),
) {
  return new StayLifecycleService(
    database,
    new StayLifecycleRepository(database, clock),
    idempotency,
  );
}
