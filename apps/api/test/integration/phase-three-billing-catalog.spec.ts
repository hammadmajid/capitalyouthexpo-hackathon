import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  hostelAuditLog,
  managerAssignments,
  organizations,
  managerInventoryGrants,
  residentChargeCatalog,
} from '@hsm/db';
import { billingCatalogEntrySchema, billingCatalogPageSchema } from '@hsm/contracts';
import { AuditWriter } from '../../src/audit/writer.js';
import { phaseTwoFixture } from './phase-two-fixture.js';
let fixture: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  fixture = await phaseTwoFixture(new Date('2026-10-19T10:00:00.000Z'));
});
afterAll(async () => {
  await fixture?.close();
});
const input = {
  code: 'electricity_kwh_v1',
  name: 'Electricity',
  unitLabel: 'kWh',
  unitAmountPaisa: 3500,
};
const url = (branchId: string) => `/v1/branches/${branchId}/charge-catalog`;
function headers(token = fixture.ownerToken, key = randomUUID()) {
  return { authorization: 'Bearer ' + token, 'Idempotency-Key': key };
}
function create(branchId: string, key = randomUUID(), token = fixture.ownerToken) {
  return fixture.application.inject({
    method: 'POST',
    url: url(branchId),
    headers: headers(token, key),
    payload: input,
  });
}
function archive(branchId: string, id: string, key = randomUUID(), token = fixture.ownerToken) {
  return fixture.application.inject({
    method: 'POST',
    url: `${url(branchId)}/${id}/archive`,
    headers: headers(token, key),
    payload: { reason: 'Replaced by a newly disclosed tariff' },
  });
}
function read(branchId: string, suffix = '', token = fixture.ownerToken) {
  return fixture.application.inject({ url: url(branchId) + suffix, headers: headers(token) });
}
function rows(branchId: string) {
  return fixture.connection.db
    .select()
    .from(residentChargeCatalog)
    .where(eq(residentChargeCatalog.branchId, branchId));
}
it('FIN-004 / ACC-001 / AUD-004: concurrent same-key HTTP creation has one immutable row and one audit', async () => {
  const own = await fixture.inventory(),
    key = randomUUID();
  const responses = await Promise.all([create(own.branchId, key), create(own.branchId, key)]);
  expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
  const entries = responses.map((response) => billingCatalogEntrySchema.parse(response.json()));
  expect(entries[0]).toEqual(entries[1]);
  expect(responses.map((response) => response.headers['idempotency-replayed']).sort()).toEqual([
    'false',
    'true',
  ]);
  expect(await rows(own.branchId)).toHaveLength(1);
  const audits = await fixture.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.branchId, own.branchId),
        eq(hostelAuditLog.action, 'billing.catalog.created'),
      ),
    );
  expect(audits).toHaveLength(1);
  expect((await create(own.branchId)).statusCode).toBe(409);
  expect(await rows(own.branchId)).toHaveLength(1);
});
it('ACC-004 / FIN-004: real Manager needs finance_view and cannot create/archive even with that grant', async () => {
  const own = await fixture.inventory(),
    foreign = await fixture.inventory(),
    assignmentId = randomUUID();
  const created = await create(own.branchId);
  expect(created.statusCode).toBe(201);
  const entry = billingCatalogEntrySchema.parse(created.json());
  await fixture.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: fixture.customerB,
    branchId: own.branchId,
    status: 'active',
    appointedByUserId: fixture.ownerId,
    activatedAt: fixture.now,
  });
  expect((await read(own.branchId, '', fixture.customerBToken)).statusCode).toBe(403);
  await fixture.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'finance_view' });
  const allowed = await read(own.branchId, '', fixture.customerBToken);
  expect(allowed.statusCode).toBe(200);
  expect(billingCatalogPageSchema.parse(allowed.json())).toMatchObject({
    canEdit: false,
    data: [entry],
  });
  expect((await create(own.branchId, randomUUID(), fixture.customerBToken)).statusCode).toBe(403);
  expect(
    (await archive(own.branchId, entry.id, randomUUID(), fixture.customerBToken)).statusCode,
  ).toBe(403);
  expect((await read(foreign.branchId, '', fixture.customerBToken)).statusCode).toBe(403);
  await fixture.connection.db
    .update(managerAssignments)
    .set({ status: 'deactivated' })
    .where(eq(managerAssignments.id, assignmentId));
  expect((await read(own.branchId, '', fixture.customerBToken)).statusCode).toBe(403);
  expect((await rows(own.branchId))[0]?.archivedAt).toBeNull();
});
it('ACC-004: a foreign catalogue child remains hidden even when the Owner controls both parents', async () => {
  const own = await fixture.inventory(),
    other = await fixture.inventory();
  const created = await create(own.branchId);
  expect(created.statusCode).toBe(201);
  const entry = billingCatalogEntrySchema.parse(created.json());
  expect((await archive(other.branchId, entry.id)).statusCode).toBe(404);
  expect((await read(own.branchId, '', fixture.customerAToken)).statusCode).toBe(403);
  expect((await create(own.branchId, randomUUID(), fixture.customerAToken)).statusCode).toBe(403);
  expect((await rows(own.branchId))[0]?.archivedAt).toBeNull();
  expect(await rows(other.branchId)).toHaveLength(0);
});
it('FIN-004 / AUD-004: database guards reject repricing/deletion while HTTP archive retains price and history', async () => {
  const own = await fixture.inventory(),
    created = await create(own.branchId);
  expect(created.statusCode).toBe(201);
  const entry = billingCatalogEntrySchema.parse(created.json()),
    key = randomUUID();
  await expect(
    fixture.connection.db
      .update(residentChargeCatalog)
      .set({ unitAmountPaisa: 4000n })
      .where(eq(residentChargeCatalog.id, entry.id)),
  ).rejects.toThrow();
  await expect(
    fixture.connection.db
      .delete(residentChargeCatalog)
      .where(eq(residentChargeCatalog.id, entry.id)),
  ).rejects.toThrow();
  const archived = await archive(own.branchId, entry.id, key);
  expect(archived.statusCode).toBe(200);
  expect(billingCatalogEntrySchema.parse(archived.json())).toEqual({
    ...entry,
    archivedAt: fixture.now.toISOString(),
  });
  const replay = await archive(own.branchId, entry.id, key);
  expect(replay.statusCode).toBe(200);
  expect(replay.headers['idempotency-replayed']).toBe('true');
  expect((await archive(own.branchId, entry.id)).statusCode).toBe(409);
  const active = await read(own.branchId),
    history = await read(own.branchId, '?includeArchived=true');
  expect(active.statusCode).toBe(200);
  expect(history.statusCode).toBe(200);
  expect(billingCatalogPageSchema.parse(active.json()).data).toHaveLength(0);
  expect(billingCatalogPageSchema.parse(history.json()).data).toEqual([
    billingCatalogEntrySchema.parse(archived.json()),
  ]);
  expect((await create(own.branchId)).statusCode).toBe(409);
  expect((await rows(own.branchId))[0]?.unitAmountPaisa).toBe(3500n);
});
it('AUD-004 / FIN-004: failed mandatory audit rolls back catalogue and idempotency before successful retry', async () => {
  const own = await fixture.inventory(),
    key = randomUUID();
  const audit = vi
    .spyOn(AuditWriter.prototype, 'hostel')
    .mockRejectedValueOnce(new Error('Audit fault injection'));
  try {
    expect((await create(own.branchId, key)).statusCode).toBe(500);
  } finally {
    audit.mockRestore();
  }
  expect(await rows(own.branchId)).toHaveLength(0);
  const retry = await create(own.branchId, key);
  expect(retry.statusCode).toBe(201);
  expect(retry.headers['idempotency-replayed']).toBe('false');
  const entry = billingCatalogEntrySchema.parse(retry.json()),
    archiveKey = randomUUID();
  const archiveAudit = vi
    .spyOn(AuditWriter.prototype, 'hostel')
    .mockRejectedValueOnce(new Error('Archive audit fault injection'));
  try {
    expect((await archive(own.branchId, entry.id, archiveKey)).statusCode).toBe(500);
  } finally {
    archiveAudit.mockRestore();
  }
  expect((await rows(own.branchId))[0]?.archivedAt).toBeNull();
  const archived = await archive(own.branchId, entry.id, archiveKey);
  expect(archived.statusCode).toBe(200);
  expect(archived.headers['idempotency-replayed']).toBe('false');
});

it('ACC-004 / FIN-004: replay cannot bypass a real ownership change', async () => {
  const own = await fixture.inventory(),
    createKey = randomUUID(),
    archiveKey = randomUUID();
  const created = await create(own.branchId, createKey);
  expect(created.statusCode).toBe(201);
  const entry = billingCatalogEntrySchema.parse(created.json());
  expect((await archive(own.branchId, entry.id, archiveKey)).statusCode).toBe(200);
  await fixture.connection.db
    .update(organizations)
    .set({ ownerUserId: fixture.customerA })
    .where(eq(organizations.id, fixture.organizationId));
  try {
    expect((await create(own.branchId, createKey)).statusCode).toBe(403);
    expect((await archive(own.branchId, entry.id, archiveKey)).statusCode).toBe(403);
    expect((await read(own.branchId)).statusCode).toBe(403);
  } finally {
    await fixture.connection.db
      .update(organizations)
      .set({ ownerUserId: fixture.ownerId })
      .where(eq(organizations.id, fixture.organizationId));
  }
  expect(await rows(own.branchId)).toHaveLength(1);
});

it('ACC-004 / FIN-004: real bounded keyset paging returns every active entry once and no phantom continuation', async () => {
  const own = await fixture.inventory();
  const ids: string[] = [];
  for (const code of ['electricity_kwh_v1', 'laundry_load_v1', 'water_unit_v1']) {
    const response = await fixture.application.inject({
      method: 'POST',
      url: url(own.branchId),
      headers: headers(),
      payload: { ...input, code },
    });
    expect(response.statusCode).toBe(201);
    ids.push(billingCatalogEntrySchema.parse(response.json()).id);
  }
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < 3; index++) {
    const response = await read(
      own.branchId,
      '?limit=1' + (cursor === null ? '' : '&cursor=' + cursor),
    );
    expect(response.statusCode).toBe(200);
    const page = billingCatalogPageSchema.parse(response.json());
    expect(page.data).toHaveLength(1);
    const entry = page.data[0];
    if (!entry) throw new Error('Expected bounded catalogue entry');
    seen.push(entry.id);
    expect(page.nextCursor).toBe(index === 2 ? null : entry.id);
    cursor = page.nextCursor;
  }
  expect(seen).toEqual(ids.sort());
  expect(new Set(seen).size).toBe(3);
  const empty = await read(own.branchId, '?limit=1&cursor=' + seen.at(-1));
  expect(empty.statusCode).toBe(200);
  expect(billingCatalogPageSchema.parse(empty.json())).toMatchObject({
    data: [],
    nextCursor: null,
  });
});
