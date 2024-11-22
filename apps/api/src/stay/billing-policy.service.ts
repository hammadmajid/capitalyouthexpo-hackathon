import {
  agreementTemplateInputSchema,
  transportBillingPolicyInputSchema,
  billingSettingsTargetSchema,
  billingSettingsInputSchema,
  billingPolicyVersionSchema,
  stayIdentifierSchema,
  DomainError,
  type BillingPolicy,
} from '@hsm/contracts';
import { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import { requireTransaction } from '../idempotency/context.js';
import { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { BillingPolicyRepository } from './billing-policy.repository.js';

export class BillingPolicyService {
  constructor(
    private readonly repository: BillingPolicyRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, target: unknown, query: unknown = {}) {
    z.object({}).strict().parse(query);
    return this.repository.read(actor, billingSettingsTargetSchema.parse(target));
  }
  template(actor: Actor, key: string, branch: unknown, body: unknown) {
    const branchId = stayIdentifierSchema.parse(branch),
      input = agreementTemplateInputSchema.parse(body);
    return this.idempotency
      .execute(
        {
          actor,
          key: stayIdentifierSchema.parse(key),
          endpoint: 'PUT branch agreement-template',
          status: 200,
        },
        { branchId },
        input,
        billingPolicyVersionSchema,
        (tx) => this.repository.authorize(tx, actor, { branchId }),
        () => this.repository.saveTemplate(requireTransaction(), actor, branchId, input),
      )
      .catch(billingCommandFailure);
  }
  transport(actor: Actor, key: string, branch: unknown, body: unknown) {
    const branchId = stayIdentifierSchema.parse(branch);
    const input = transportBillingPolicyInputSchema.parse(body);
    return this.idempotency
      .execute(
        {
          actor,
          key: stayIdentifierSchema.parse(key),
          endpoint: 'PUT branch billing-policy/transport',
          status: 200,
        },
        { branchId },
        input,
        billingPolicyVersionSchema,
        async (tx) => {
          await this.repository.authorizeTransport(tx, actor, branchId);
          return true;
        },
        () => this.repository.saveTransport(requireTransaction(), actor, branchId, input),
      )
      .catch(billingCommandFailure);
  }
  save(actor: Actor, key: string, target: unknown, body: unknown) {
    const scope = billingSettingsTargetSchema.parse(target),
      input = billingSettingsInputSchema.parse(body),
      commandKey = stayIdentifierSchema.parse(key);
    return this.idempotency
      .execute(
        { actor, key: commandKey, endpoint: 'PUT branch billing-policy', status: 200 },
        scope,
        input,
        billingPolicyVersionSchema.refine(
          (value) =>
            value.level === (scope.roomTypeId ? 'room_type' : 'branch') &&
            value.scopeId === (scope.roomTypeId ?? scope.branchId) &&
            sameRentPolicy(value.policy, input.policy),
        ),
        (transaction) => this.repository.authorize(transaction, actor, scope),
        () => this.repository.save(requireTransaction(), actor, scope, input.policy),
      )
      .catch(billingCommandFailure);
  }
}

function billingCommandFailure(error: unknown): never {
  // SEC-003: request boundaries are parsed before execution; response failures are server faults.
  if (error instanceof z.ZodError)
    throw new DomainError('INTERNAL', 500, 'Billing policy response unavailable');
  return inventoryFailure(error);
}

function sameRentPolicy(a: BillingPolicy, b: BillingPolicy) {
  return (
    JSON.stringify({ ...a, transportBilling: undefined }) ===
    JSON.stringify({ ...b, transportBilling: undefined })
  );
}
