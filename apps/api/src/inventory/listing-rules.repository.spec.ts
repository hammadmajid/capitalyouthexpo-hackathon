import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { hostelRules } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { ruleIds as ids, ruleNow, ruleRow } from '../../test/unit/listing-rules.fixture.js';
import { AuditWriter } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { inventoryPermissions } from './permissions.js';
import { projectListingRule } from './listing-rules-state.js';
import { ListingRulesRepository } from './listing-rules.repository.js';
vi.mock('uuid', () => ({ v7: () => '019a1234-1234-7123-8123-123456789abc' }));
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('./scope.js', () => ({ lockInventoryScope: vi.fn() }));
vi.mock('./permissions.js', () => ({ inventoryPermissions: vi.fn() }));
const actor = { userId: randomUUID(), sessionId: randomUUID() };
const scope = {
  organizationId: randomUUID(),
  brandId: randomUUID(),
  ownerId: actor.userId,
  actorRole: 'owner' as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(lockActor).mockResolvedValue(undefined);
  vi.mocked(lockInventoryScope).mockResolvedValue(scope);
  vi.mocked(inventoryPermissions).mockResolvedValue({
    permissions: ['listing_edit'],
    canConfigureManagers: true,
  });
});
function fixture() {
  const store = queryFixture(),
    audit = new AuditWriter();
  vi.spyOn(audit, 'hostel').mockResolvedValue(undefined);
  return {
    store,
    audit,
    repository: new ListingRulesRepository(store.database, audit, () => ruleNow),
  };
}
it.each([true, false])(
  'ACC-004: exact current rule and pages expose actual edit capability %s',
  async (canEdit) => {
    const value = fixture();
    vi.mocked(inventoryPermissions).mockResolvedValue({
      permissions: canEdit ? ['listing_edit'] : [],
      canConfigureManagers: false,
    });
    value.store.enqueue(hostelRules, [ruleRow()], [ruleRow()]);
    expect(await value.repository.one(actor, ids.branch, ids.first)).toMatchObject({
      id: ids.first,
      canEdit,
    });
    expect(
      await value.repository.read(actor, ids.branch, { limit: 20, state: 'active' }),
    ).toMatchObject({ canEdit, data: [projectListingRule(ruleRow())] });
    expect(lockInventoryScope).toHaveBeenCalledWith(
      value.store.transaction,
      actor,
      ids.branch,
      undefined,
    );
    expect(value.audit.hostel).not.toHaveBeenCalled();
    expect(value.store.writes).toEqual([]);
  },
);
it('ACC-004: denied branch precedes child reads, writes and audit', async () => {
  const value = fixture();
  vi.mocked(lockInventoryScope).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Denied'));
  await expect(value.repository.one(actor, ids.branch, ids.first)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(value.store.operations).toEqual([]);
  expect(value.store.writes).toEqual([]);
});
it('TRUST-006 / AUD-001: creation uses one transaction, rereads stored state and audits actual text', async () => {
  const value = fixture();
  value.store.enqueue(hostelRules, [], [ruleRow({ body: 'Actual rule', sortOrder: 3 })]);
  const result = await value.repository.create(value.store.transaction, actor, ids.branch, {
    body: 'Actual rule',
    sortOrder: 3,
  });
  expect(result).toMatchObject({
    body: 'Actual rule',
    sortOrder: 3,
    canEdit: true,
    archivedAt: null,
  });
  expect(value.store.writes).toHaveLength(1);
  expect(value.audit.hostel).toHaveBeenCalledWith(
    value.store.transaction,
    expect.objectContaining({
      branchId: ids.branch,
      targetId: result.id,
      action: 'listing.rule.created',
      before: null,
      after: expect.objectContaining({ body: 'Actual rule' }),
    }),
  );
});
it('TRUST-006 / AUD-001: edit increments revision and audits actual before/after in the same transaction', async () => {
  const value = fixture();
  value.store.enqueue(
    hostelRules,
    [ruleRow()],
    [],
    [ruleRow({ body: 'Updated', sortOrder: 2, revision: 2 })],
  );
  const result = await value.repository.edit(
    value.store.transaction,
    actor,
    ids.branch,
    ids.first,
    projectListingRule(ruleRow()).version,
    { body: 'Updated', sortOrder: 2 },
  );
  expect(result).toMatchObject({ body: 'Updated', canEdit: true });
  expect(result.version).not.toBe(projectListingRule(ruleRow()).version);
  expect(value.store.writes).toHaveLength(1);
  expect(value.audit.hostel).toHaveBeenCalledWith(
    value.store.transaction,
    expect.objectContaining({
      action: 'listing.rule.changed',
      before: projectListingRule(ruleRow()),
      after: expect.objectContaining({ body: 'Updated' }),
    }),
  );
});
it.each(['stale', 'archived', 'exhausted', 'missing'] as const)(
  'ACC-004: %s rule cannot receive an edit or successful audit',
  async (kind) => {
    const value = fixture(),
      row = ruleRow(
        kind === 'archived'
          ? { archivedAt: ruleNow }
          : kind === 'exhausted'
            ? { revision: 2147483647 }
            : {},
      );
    if (kind !== 'missing') value.store.enqueue(hostelRules, [row]);
    await expect(
      value.repository.edit(
        value.store.transaction,
        actor,
        ids.branch,
        ids.first,
        kind === 'stale' ? '0'.repeat(64) : projectListingRule(row).version,
        { body: 'Changed', sortOrder: 0 },
      ),
    ).rejects.toMatchObject({
      code:
        kind === 'stale' ? 'PRECONDITION_FAILED' : kind === 'missing' ? 'NOT_FOUND' : 'CONFLICT',
    });
    expect(value.store.writes).toEqual([]);
    expect(value.audit.hostel).not.toHaveBeenCalled();
  },
);
it.each([1, 2147483647])(
  'AUD-001: archival retains rows even at revision limit %s and records its reason',
  async (revision) => {
    const value = fixture(),
      row = ruleRow({ revision });
    value.store.enqueue(
      hostelRules,
      [row],
      [],
      [ruleRow({ revision: revision === 1 ? 2 : revision, archivedAt: ruleNow })],
    );
    const result = await value.repository.archive(
      value.store.transaction,
      actor,
      ids.branch,
      ids.first,
      projectListingRule(row).version,
      'Superseded',
    );
    expect(result.archivedAt).toBe(ruleNow.toISOString());
    expect(result.version).not.toBe(projectListingRule(row).version);
    expect(value.store.operations.some((operation) => operation.kind === 'delete')).toBe(false);
    expect(value.audit.hostel).toHaveBeenCalledWith(
      value.store.transaction,
      expect.objectContaining({
        action: 'listing.rule.archived',
        after: expect.objectContaining({ reason: 'Superseded' }),
      }),
    );
  },
);
it('AUD-001: audit failure rejects the command; actual rollback remains a real PostgreSQL integration requirement', async () => {
  const value = fixture();
  value.store.enqueue(hostelRules, [ruleRow()], [], [ruleRow({ revision: 2 })]);
  vi.mocked(value.audit.hostel).mockRejectedValue(new Error('audit unavailable'));
  await expect(
    value.repository.edit(
      value.store.transaction,
      actor,
      ids.branch,
      ids.first,
      projectListingRule(ruleRow()).version,
      { body: ruleRow().body, sortOrder: 0 },
    ),
  ).rejects.toThrow('audit unavailable');
});
