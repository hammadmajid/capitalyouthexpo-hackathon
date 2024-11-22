import { z } from 'zod';
import {
  listingPreconditionSchema,
  listingRuleArchiveSchema,
  listingRuleInputSchema,
  listingRulesQuerySchema,
  privateListingRuleStateSchema,
  type ListingRuleInput,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { ListingRulesRepository } from './listing-rules.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
type Command = { kind: 'edit'; input: ListingRuleInput } | { kind: 'archive'; reason: string };
export class ListingRulesService {
  constructor(
    private readonly repository: ListingRulesRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  read(actor: Actor, branchId: string, query: unknown) {
    return this.repository.read(actor, id.parse(branchId), listingRulesQuerySchema.parse(query));
  }
  one(actor: Actor, branchId: string, ruleId: string, query: unknown) {
    z.object({}).strict().parse(query);
    return this.repository.one(actor, id.parse(branchId), id.parse(ruleId));
  }
  create(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = id.parse(branchId),
      input = listingRuleInputSchema.parse(body);
    return this.idempotency.execute(
      { actor, key, endpoint: 'POST /branches/:branchId/rules', status: 201 },
      { branch },
      input,
      privateListingRuleStateSchema,
      async (transaction) => {
        await this.repository.authorize(transaction, actor, branch);
        return true;
      },
      () => this.repository.create(requireTransaction(), actor, branch, input),
    );
  }
  edit(
    actor: Actor,
    key: string,
    branchId: string,
    ruleId: string,
    ifMatch: unknown,
    body: unknown,
  ) {
    return this.write(actor, key, branchId, ruleId, ifMatch, {
      kind: 'edit',
      input: listingRuleInputSchema.parse(body),
    });
  }
  archive(
    actor: Actor,
    key: string,
    branchId: string,
    ruleId: string,
    ifMatch: unknown,
    body: unknown,
  ) {
    return this.write(actor, key, branchId, ruleId, ifMatch, {
      kind: 'archive',
      reason: listingRuleArchiveSchema.parse(body).reason,
    });
  }
  private write(
    actor: Actor,
    key: string,
    branchId: string,
    ruleId: string,
    ifMatch: unknown,
    command: Command,
  ) {
    const branch = id.parse(branchId),
      rule = id.parse(ruleId),
      version = listingPreconditionSchema.parse(ifMatch);
    return this.idempotency.execute(
      {
        actor,
        key,
        endpoint:
          command.kind === 'edit'
            ? 'PUT /branches/:branchId/rules/:ruleId'
            : 'POST /branches/:branchId/rules/:ruleId/archive',
        status: 200,
      },
      { branch, rule },
      { version, command },
      privateListingRuleStateSchema,
      async (transaction) => {
        await this.repository.authorizeRule(transaction, actor, branch, rule);
        return true;
      },
      () =>
        command.kind === 'edit'
          ? this.repository.edit(requireTransaction(), actor, branch, rule, version, command.input)
          : this.repository.archive(
              requireTransaction(),
              actor,
              branch,
              rule,
              version,
              command.reason,
            ),
    );
  }
}
