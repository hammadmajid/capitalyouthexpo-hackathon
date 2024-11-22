import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import { ruleIds as ids, ruleRow } from '../../test/unit/listing-rules.fixture.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyStore, StoredResponse } from '../idempotency/store.js';
import { projectListingRule } from './listing-rules-state.js';
import { ListingRulesRepository } from './listing-rules.repository.js';
import { ListingRulesService } from './listing-rules.service.js';
const actor = { userId: randomUUID(), sessionId: randomUUID() },
  result = { ...projectListingRule(ruleRow()), canEdit: true };
const input = { body: ruleRow().body, sortOrder: 0 },
  ifMatch = '"' + result.version + '"';
function fixture() {
  const query = queryFixture(),
    responses = new Map<string, StoredResponse>();
  const store: IdempotencyStore = {
    transaction: async (_actor, _now, work) =>
      work({
        database: query.transaction,
        read: async (key) => responses.get(key),
        remove: async (key) => {
          responses.delete(key);
        },
        save: async (key, response) => {
          responses.set(key, response);
        },
      }),
  };
  const repository = new ListingRulesRepository(query.database);
  const scope = {
    organizationId: randomUUID(),
    brandId: randomUUID(),
    ownerId: actor.userId,
    actorRole: 'owner' as const,
  };
  const authorize = vi.spyOn(repository, 'authorize').mockResolvedValue(scope);
  const authorizeRule = vi
    .spyOn(repository, 'authorizeRule')
    .mockResolvedValue({ scope, row: ruleRow() });
  const mutation = async (transaction: Parameters<ListingRulesRepository['create']>[0]) => {
    expect(requireTransaction()).toBe(transaction);
    return result;
  };
  const create = vi.spyOn(repository, 'create').mockImplementation(mutation);
  const edit = vi.spyOn(repository, 'edit').mockImplementation(mutation);
  const archive = vi.spyOn(repository, 'archive').mockImplementation(mutation);
  const read = vi.spyOn(repository, 'read').mockResolvedValue({
    branchId: ids.branch,
    state: 'active',
    canEdit: true,
    data: [projectListingRule(ruleRow())],
    nextCursor: null,
  });
  const one = vi.spyOn(repository, 'one').mockResolvedValue(result);
  return {
    query,
    responses,
    authorize,
    authorizeRule,
    create,
    edit,
    archive,
    read,
    one,
    service: new ListingRulesService(repository, new IdempotencyService(store)),
  };
}
it('TRUST-006 / ACC-004: canonical creation replays once and rechecks current branch authority', async () => {
  const value = fixture(),
    key = randomUUID();
  expect(
    (
      await value.service.create(actor, key, ids.branch.toUpperCase(), {
        ...input,
        body: '  ' + input.body + '  ',
      })
    ).body,
  ).toEqual(result);
  expect((await value.service.create(actor, key, ids.branch, input)).replayed).toBe(true);
  expect(value.create).toHaveBeenCalledTimes(1);
  expect(value.authorize).toHaveBeenCalledTimes(2);
  expect(value.create).toHaveBeenCalledWith(value.query.transaction, actor, ids.branch, input);
  value.authorize.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
  await expect(value.service.create(actor, key, ids.branch, input)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(value.create).toHaveBeenCalledTimes(1);
});
it.each(['edit', 'archive'] as const)(
  'ACC-004 / AUD-001: %s binds exact object/version/command and reauthorizes stored success',
  async (kind) => {
    const value = fixture(),
      key = randomUUID();
    const call = () =>
      kind === 'edit'
        ? value.service.edit(actor, key, ids.branch, ids.first, ifMatch, input)
        : value.service.archive(actor, key, ids.branch, ids.first, ifMatch, {
            reason: 'Superseded',
          });
    expect((await call()).status).toBe(200);
    expect((await call()).replayed).toBe(true);
    expect(value[kind]).toHaveBeenCalledTimes(1);
    expect(value.authorizeRule).toHaveBeenCalledTimes(2);
    expect(value.authorizeRule).toHaveBeenCalledWith(
      value.query.transaction,
      actor,
      ids.branch,
      ids.first,
    );
    value.authorizeRule.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Revoked'));
    await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(value[kind]).toHaveBeenCalledTimes(1);
  },
);
it.each(['branch', 'rule', 'version', 'body', 'order', 'operation'] as const)(
  'ACC-004: reused key cannot retarget %s',
  async (change) => {
    const value = fixture(),
      key = randomUUID();
    await value.service.edit(actor, key, ids.branch, ids.first, ifMatch, input);
    const command =
      change === 'operation'
        ? value.service.archive(actor, key, ids.branch, ids.first, ifMatch, { reason: 'Changed' })
        : value.service.edit(
            actor,
            key,
            change === 'branch' ? ids.third : ids.branch,
            change === 'rule' ? ids.second : ids.first,
            change === 'version' ? '"' + '0'.repeat(64) + '"' : ifMatch,
            {
              body: change === 'body' ? 'Changed' : input.body,
              sortOrder: change === 'order' ? 1 : 0,
            },
          );
    await expect(command).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(value.edit).toHaveBeenCalledTimes(1);
    expect(value.archive).not.toHaveBeenCalled();
  },
);
it('ACC-004: read normalizes scope and validates strict query before repository access', async () => {
  const value = fixture();
  await value.service.read(actor, ids.branch.toUpperCase(), {});
  expect(value.read).toHaveBeenCalledWith(actor, ids.branch, { limit: 20, state: 'active' });
  await value.service.one(actor, ids.branch.toUpperCase(), ids.first.toUpperCase(), {});
  expect(value.one).toHaveBeenCalledWith(actor, ids.branch, ids.first);
  expect(() => value.service.one(actor, ids.branch, ids.first, { private: true })).toThrow();
  expect(() => value.service.read(actor, ids.branch, { state: 'all' })).toThrow();
  expect(() =>
    value.service.create(actor, randomUUID(), ids.branch, { ...input, requiredDocuments: [] }),
  ).toThrow();
});
it.each([undefined, '*', result.version, '"short"'])(
  'ACC-004: invalid precondition %s fails before mutation or authorization',
  (header) => {
    const value = fixture();
    expect(() =>
      value.service.edit(actor, randomUUID(), ids.branch, ids.first, header, input),
    ).toThrow();
    expect(() =>
      value.service.archive(actor, randomUUID(), ids.branch, ids.first, header, {
        reason: 'Superseded',
      }),
    ).toThrow();
    expect(value.authorizeRule).not.toHaveBeenCalled();
    expect(value.edit).not.toHaveBeenCalled();
    expect(value.archive).not.toHaveBeenCalled();
  },
);
it('TRUST-006: conflicts do not record successful idempotency responses', async () => {
  const value = fixture();
  value.edit.mockRejectedValue(new DomainError('PRECONDITION_FAILED', 412, 'Changed'));
  await expect(
    value.service.edit(actor, randomUUID(), ids.branch, ids.first, ifMatch, input),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  expect(value.responses.size).toBe(0);
});
