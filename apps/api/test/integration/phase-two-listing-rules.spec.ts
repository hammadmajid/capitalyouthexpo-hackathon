import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  branches,
  hostelRules,
  hostelAuditLog,
  managerAssignments,
  managerInventoryGrants,
} from '@hsm/db';
import {
  privateListingRuleStateSchema,
  privateListingRulesPageSchema,
  publicListingRulesPageSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { ListingRulesRepository } from '../../src/inventory/listing-rules.repository.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-17T10:00:00Z'));
});
afterAll(async () => {
  await fixture?.close();
});
const url = (branch: string) => '/v1/branches/' + branch + '/rules';
const headers = (token = fixture.ownerToken) => ({ authorization: 'Bearer ' + token });
async function create(
  branch: string,
  body = 'Keep shared spaces tidy.',
  token = fixture.ownerToken,
) {
  const response = await fixture.application.inject({
    method: 'POST',
    url: url(branch),
    headers: { ...headers(token), 'Idempotency-Key': randomUUID() },
    payload: { body, sortOrder: 0 },
  });
  expect(response.statusCode).toBe(201);
  return privateListingRuleStateSchema.parse(response.json());
}
async function one(branch: string, rule: string, token = fixture.ownerToken) {
  const response = await fixture.application.inject({
    url: url(branch) + '/' + rule,
    headers: headers(token),
  });
  expect(response.statusCode).toBe(200);
  const result = privateListingRuleStateSchema.parse(response.json());
  expect(response.headers.etag).toBe('"' + result.version + '"');
  expect(response.headers['cache-control']).toBe('no-store');
  return result;
}
function edit(
  branch: string,
  rule: string,
  version: string,
  body: string,
  key = randomUUID(),
  token = fixture.ownerToken,
) {
  return fixture.application.inject({
    method: 'PUT',
    url: url(branch) + '/' + rule,
    headers: { ...headers(token), 'Idempotency-Key': key, 'If-Match': '"' + version + '"' },
    payload: { body, sortOrder: 0 },
  });
}
async function publicPage(branch: string, query = '') {
  const response = await fixture.application.inject({
    url: '/v1/marketplace/' + branch + '/rules' + query,
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  return publicListingRulesPageSchema.parse(response.json());
}
it('TRUST-006 / AUD-001: real HTTP create/edit/replay/stale/archive retains audited history and excludes private metadata publicly', async () => {
  const inventory = await fixture.inventory(),
    initial = await create(inventory.branchId),
    key = randomUUID();
  const response = await edit(
    inventory.branchId,
    initial.id,
    initial.version,
    'Quiet common areas.',
    key,
  );
  expect(response.statusCode).toBe(200);
  const updated = privateListingRuleStateSchema.parse(response.json());
  expect(updated.version).not.toBe(initial.version);
  const replay = await edit(
    inventory.branchId,
    initial.id,
    initial.version,
    'Quiet common areas.',
    key,
  );
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect(
    (await edit(inventory.branchId, initial.id, initial.version, 'Stale edit')).statusCode,
  ).toBe(412);
  expect((await publicPage(inventory.branchId)).data).toEqual([
    { id: initial.id, body: 'Quiet common areas.', sortOrder: 0 },
  ]);
  const archived = await fixture.application.inject({
    method: 'POST',
    url: url(inventory.branchId) + '/' + initial.id + '/archive',
    headers: {
      ...headers(),
      'Idempotency-Key': randomUUID(),
      'If-Match': '"' + updated.version + '"',
    },
    payload: { reason: 'Superseded' },
  });
  expect(archived.statusCode).toBe(200);
  expect((await publicPage(inventory.branchId)).data).toEqual([]);
  const history = await fixture.application.inject({
    url: url(inventory.branchId) + '?state=archived',
    headers: headers(),
  });
  expect(history.statusCode).toBe(200);
  expect(privateListingRulesPageSchema.parse(history.json()).data.map((row) => row.id)).toEqual([
    initial.id,
  ]);
  expect((await one(inventory.branchId, initial.id)).archivedAt).not.toBeNull();
  const audit = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(eq(hostelAuditLog.targetId, initial.id));
  expect(audit.map((row) => row.action).sort()).toEqual([
    'listing.rule.archived',
    'listing.rule.changed',
    'listing.rule.created',
  ]);
});
it('ACC-004: real Manager grant and its revocation govern mutation and replay while foreign children stay unavailable', async () => {
  const inventory = await fixture.inventory(),
    foreign = await fixture.inventory(),
    initial = await create(inventory.branchId),
    foreignRule = await create(foreign.branchId),
    assignmentId = randomUUID(),
    key = randomUUID();
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: inventory.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  expect((await one(inventory.branchId, initial.id, fixture.customerBToken)).canEdit).toBe(false);
  expect(
    (
      await edit(
        inventory.branchId,
        initial.id,
        initial.version,
        'Manager edit',
        key,
        fixture.customerBToken,
      )
    ).statusCode,
  ).toBe(403);
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'listing_edit', grantedAt: fixture.now });
  expect(
    (
      await edit(
        inventory.branchId,
        initial.id,
        initial.version,
        'Manager edit',
        key,
        fixture.customerBToken,
      )
    ).statusCode,
  ).toBe(200);
  await fixture.connection.db
    .delete(managerInventoryGrants)
    .where(
      and(
        eq(managerInventoryGrants.assignmentId, assignmentId),
        eq(managerInventoryGrants.permission, 'listing_edit'),
      ),
    );
  expect(
    (
      await edit(
        inventory.branchId,
        initial.id,
        initial.version,
        'Manager edit',
        key,
        fixture.customerBToken,
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await fixture.application.inject({
        url: url(inventory.branchId) + '/' + foreignRule.id,
        headers: headers(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await fixture.application.inject({
        url: url(foreign.branchId),
        headers: headers(fixture.customerBToken),
      })
    ).statusCode,
  ).toBe(403);
  expect((await fixture.application.inject({ url: url(inventory.branchId) })).statusCode).toBe(401);
});
it('TRUST-006 / AUD-001: forced real transaction rollback preserves rule and audit together', async () => {
  const inventory = await fixture.inventory(),
    initial = await create(inventory.branchId),
    actor = await fixture.service.authenticate(fixture.ownerToken);
  const repository = new ListingRulesRepository(
    fixture.connection.db,
    undefined,
    () => fixture.now,
  );
  await expect(
    fixture.connection.db.transaction(async (transaction) => {
      await repository.edit(transaction, actor, inventory.branchId, initial.id, initial.version, {
        body: 'Must roll back',
        sortOrder: 3,
      });
      throw new Error('Forced rules rollback');
    }),
  ).rejects.toThrow('Forced rules rollback');
  expect(await one(inventory.branchId, initial.id)).toEqual(initial);
  expect(
    await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(eq(hostelAuditLog.targetId, initial.id)),
  ).toHaveLength(1);
});
it('ACC-004: concurrent real edits with one version commit exactly one text and one change audit', async () => {
  const inventory = await fixture.inventory(),
    initial = await create(inventory.branchId);
  const responses = await Promise.all(
    ['First edit', 'Second edit'].map((body) =>
      edit(inventory.branchId, initial.id, initial.version, body),
    ),
  );
  expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 412]);
  const winner = responses.find((response) => response.statusCode === 200);
  if (!winner) throw new Error('Missing successful concurrent rule edit');
  expect((await one(inventory.branchId, initial.id)).body).toBe(
    privateListingRuleStateSchema.parse(winner.json()).body,
  );
  expect(
    await fixture.connection.db
      .select()
      .from(hostelAuditLog)
      .where(
        and(
          eq(hostelAuditLog.targetId, initial.id),
          eq(hostelAuditLog.action, 'listing.rule.changed'),
        ),
      ),
  ).toHaveLength(1);
});
it('ACC-002: more than one hundred actual rules remain reachable and withdrawal immediately blocks public reads', async () => {
  const inventory = await fixture.inventory();
  await fixture.connection.db.insert(hostelRules).values(
    Array.from({ length: 103 }, (_, sortOrder) => ({
      id: randomUUID(),
      branchId: inventory.branchId,
      body: 'Fixture rule ' + String(sortOrder),
      sortOrder,
    })),
  );
  const first = await publicPage(inventory.branchId, '?limit=100');
  expect(first.data).toHaveLength(100);
  expect(first.nextCursor).not.toBeNull();
  const second = await publicPage(
    inventory.branchId,
    '?limit=100&cursor=' + encodeURIComponent(first.nextCursor ?? ''),
  );
  expect(second.data.map((row) => row.sortOrder)).toEqual([100, 101, 102]);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.data, ...second.data].map((row) => row.id)).size).toBe(103);
  await fixture.connection.db
    .update(branches)
    .set({ listingHiddenAt: fixture.now })
    .where(eq(branches.id, inventory.branchId));
  expect(
    (await fixture.application.inject({ url: '/v1/marketplace/' + inventory.branchId + '/rules' }))
      .statusCode,
  ).toBe(404);
});
it('TRUST-006: actual database constraints reject empty, oversized and invalid ordered rule metadata', async () => {
  const inventory = await fixture.inventory();
  for (const invalid of [
    { body: '' },
    { body: '   ' },
    { body: 'x'.repeat(4001) },
    { sortOrder: -1 },
    { revision: 0 },
  ]) {
    await expect(
      fixture.connection.db.transaction(async (transaction) => {
        await transaction.insert(hostelRules).values({
          id: randomUUID(),
          branchId: inventory.branchId,
          body: 'Valid text',
          sortOrder: 0,
          ...invalid,
        });
      }),
    ).rejects.toThrow();
  }
  expect(
    await fixture.connection.db
      .select()
      .from(hostelRules)
      .where(eq(hostelRules.branchId, inventory.branchId)),
  ).toEqual([]);
});
