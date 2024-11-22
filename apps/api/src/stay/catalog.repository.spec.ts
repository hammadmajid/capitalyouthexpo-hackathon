import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { hostelAuditLog, residentChargeCatalog } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { AuditWriter } from '../audit/writer.js';
import { queryFixture } from '../../test/unit/query-fixture.js';
import {
  catalogActor as actor,
  catalogIds as ids,
  catalogNow as now,
  catalogRow,
  catalogInput as input,
  catalogEntry,
  catalogScopeFixture as scope,
} from '../../test/unit/billing-catalog.fixture.js';
import { catalogScope, lockCatalogEntry } from './catalog.scope.js';
import { BillingCatalogRepository } from './catalog.repository.js';
vi.mock('./catalog.scope.js', () => ({ catalogScope: vi.fn(), lockCatalogEntry: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(catalogScope).mockResolvedValue(scope);
  vi.mocked(lockCatalogEntry).mockResolvedValue(catalogRow());
});
function fixture() {
  const f = queryFixture(),
    audit = new AuditWriter(),
    clock = () => now;
  return { ...f, audit, clock, repository: new BillingCatalogRepository(f.database, audit, clock) };
}
it('FIN-004 / ACC-004: catalogue page is bounded, exact-keyset ordered, scoped and private', async () => {
  const f = fixture();
  f.enqueue(residentChargeCatalog, [catalogRow(), catalogRow({ id: ids.next })]);
  const page = await f.repository.read(actor, ids.branch, { limit: 1 });
  expect(page).toEqual({
    branchId: ids.branch,
    canEdit: true,
    includeArchived: false,
    data: [catalogEntry],
    nextCursor: ids.entry,
  });
  expect(f.operations).toContainEqual({ table: residentChargeCatalog, kind: 'limit', args: [2] });
  expect(f.operations).toContainEqual({
    table: residentChargeCatalog,
    kind: 'orderBy',
    args: [residentChargeCatalog.id],
  });
  expect(f.writes).toHaveLength(0);
  expect(catalogScope).toHaveBeenCalledWith(f.transaction, actor, ids.branch, f.clock);
  const p = f.predicates[0];
  if (!p) throw Error('Missing scope');
  const query = new PgDialect().sqlToQuery(p.value);
  expect(query.params).toEqual([ids.branch]);
  expect(query.sql).toContain('"archived_at" is null');
});
it('FIN-004: explicit historical catalogue page retains price and marks Manager read-only', async () => {
  const f = fixture();
  vi.mocked(catalogScope).mockResolvedValue({ ...scope, actorRole: 'manager' });
  f.enqueue(residentChargeCatalog, [catalogRow({ id: ids.next, archivedAt: now })]);
  expect(
    await f.repository.read(actor, ids.branch, {
      limit: 20,
      cursor: ids.entry,
      includeArchived: 'true',
    }),
  ).toEqual({
    branchId: ids.branch,
    canEdit: false,
    includeArchived: true,
    data: [{ ...catalogEntry, id: ids.next, archivedAt: now.toISOString() }],
    nextCursor: null,
  });
  const p = f.predicates[0];
  if (!p) throw Error('Missing scope');
  const sql = new PgDialect().sqlToQuery(p.value);
  expect(sql.params).toEqual([ids.branch, ids.entry]);
  expect(sql.sql).not.toContain('"archived_at" is null');
});
it.each([
  [catalogRow({ branchId: ids.brand })],
  [catalogRow({ id: ids.next }), catalogRow()],
  [catalogRow(), catalogRow(), catalogRow()],
  [catalogRow({ archivedAt: now })],
])(
  'ACC-004: cross-scope, unordered, oversized or unexpectedly archived catalogue page %# fails closed',
  async (...rows) => {
    const f = fixture();
    f.enqueue(residentChargeCatalog, rows);
    await expect(f.repository.read(actor, ids.branch, { limit: 1 })).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  },
);
it('FIN-004: empty catalogue is honest absence rather than invented charge codes', async () => {
  const f = fixture();
  expect((await f.repository.read(actor, ids.branch, { limit: 20 })).data).toEqual([]);
});
it('ACC-004: create and archive replay authorizers require Owner and exact child even when already archived', async () => {
  const f = fixture();
  expect(await f.repository.authorizeCreate(f.transaction, actor, ids.branch)).toBe(true);
  vi.mocked(lockCatalogEntry).mockResolvedValue(catalogRow({ archivedAt: now }));
  expect(await f.repository.authorizeArchive(f.transaction, actor, ids.branch, ids.entry)).toBe(
    true,
  );
  expect(catalogScope).toHaveBeenCalledWith(f.transaction, actor, ids.branch, f.clock, true);
  expect(lockCatalogEntry).toHaveBeenCalledWith(f.transaction, ids.branch, ids.entry);
  expect(f.writes).toHaveLength(0);
});
it('FIN-004 / AUD-004: Owner creates one immutable price record and audit in the caller transaction', async () => {
  const f = fixture(),
    audit = vi.spyOn(f.audit, 'hostel');
  const result = await f.repository.create(f.transaction, actor, ids.branch, input);
  expect(result).toMatchObject(input);
  expect(result.branchId).toBe(ids.branch);
  expect(result.archivedAt).toBeNull();
  expect(f.writes.map((x) => x.table)).toEqual([residentChargeCatalog, hostelAuditLog]);
  expect(f.writes[0]?.value).toMatchObject({
    ...input,
    unitAmountPaisa: 3500n,
    branchId: ids.branch,
    createdByUserId: actor.userId,
    createdAt: now,
  });
  expect(audit).toHaveBeenCalledWith(
    f.transaction,
    expect.objectContaining({
      actorUserId: actor.userId,
      actorRole: 'owner',
      organizationId: ids.organization,
      branchId: ids.branch,
      action: 'billing.catalog.created',
      targetId: result.id,
      after: result,
    }),
  );
});
it('FIN-004 / AUD-004: archive changes only archive time, retains price and audits reason with before/after', async () => {
  const f = fixture(),
    audit = vi.spyOn(f.audit, 'hostel');
  expect(
    await f.repository.archive(
      f.transaction,
      actor,
      ids.branch,
      ids.entry,
      'Owner retired the code',
    ),
  ).toEqual({ ...catalogEntry, archivedAt: now.toISOString() });
  expect(f.writes[0]).toEqual({
    table: residentChargeCatalog,
    kind: 'update',
    value: { archivedAt: now },
  });
  const p = f.predicates[0];
  if (!p) throw Error('Missing archive scope');
  expect(new PgDialect().sqlToQuery(p.value).params).toEqual([ids.branch, ids.entry]);
  expect(audit).toHaveBeenCalledWith(
    f.transaction,
    expect.objectContaining({
      action: 'billing.catalog.archived',
      before: catalogEntry,
      after: { ...catalogEntry, archivedAt: now.toISOString(), reason: 'Owner retired the code' },
    }),
  );
});
it('FIN-004: a new command cannot archive an already archived record again', async () => {
  const f = fixture();
  vi.mocked(lockCatalogEntry).mockResolvedValue(catalogRow({ archivedAt: now }));
  await expect(
    f.repository.archive(f.transaction, actor, ids.branch, ids.entry, 'Again'),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.writes).toHaveLength(0);
});
it('AUD-004: mandatory audit failure propagates; actual rollback is required in PG acceptance', async () => {
  const f = fixture();
  vi.spyOn(f.audit, 'hostel').mockRejectedValueOnce(new Error('Mandatory audit unavailable'));
  await expect(f.repository.create(f.transaction, actor, ids.branch, input)).rejects.toThrow(
    'Mandatory audit unavailable',
  );
});
it('ACC-004: denied scope cannot produce a catalogue read or a mutation', async () => {
  const f = fixture();
  vi.mocked(catalogScope).mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Unavailable'));
  await expect(f.repository.read(actor, ids.branch, { limit: 20 })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(f.repository.create(f.transaction, actor, ids.branch, input)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(f.predicates).toHaveLength(0);
  expect(f.writes).toHaveLength(0);
});
it('FIN-004: invalid clock chronology cannot create a fabricated archive result', async () => {
  const f = fixture();
  vi.mocked(lockCatalogEntry).mockResolvedValue(
    catalogRow({ createdAt: new Date(now.getTime() + 1000) }),
  );
  await expect(
    f.repository.archive(f.transaction, actor, ids.branch, ids.entry, 'Retired'),
  ).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(f.writes).toHaveLength(0);
});
