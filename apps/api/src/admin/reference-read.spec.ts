import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { announcements, places, placeAliases, platformAuditLog } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { AdminReferenceReadService } from './reference-read.service.js';
const mocks = vi.hoisted(() => ({ lock: vi.fn() }));
vi.mock('./scope.js', () => ({ lockAdmin: mocks.lock }));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { userId: id(1), sessionId: id(2) },
  now = new Date('2026-10-30T10:00:00Z');
let s: ReturnType<typeof queryFixture>;
const announcement = (n: number) => ({
  id: id(n),
  audience: 'city',
  branchIds: [],
  cityId: id(9),
  title: 'Notice',
  body: 'Body',
  status: 'sent',
  scheduledAt: now,
  sentAt: now,
  recipientCount: 0,
  version: 1,
  createdAt: now,
});
const institution = (n: number) => ({
  id: id(n),
  revision: '0',
  name: 'Institute',
  shortName: null,
  cityId: id(9),
  areaId: null,
  address: null,
  latitude: 33.7,
  longitude: 73,
  isActive: false,
  publicApproved: false,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue({ isRoot: true });
  s = queryFixture();
});
it('ADM-010: history uses stable UUID continuation, real recipient counts and exact targeting', async () => {
  s.enqueue(announcements, [announcement(5), announcement(4), announcement(3)]);
  const result = await new AdminReferenceReadService(s.database).announcements(actor, {
    status: 'sent',
    cursor: id(6),
    limit: 2,
  });
  expect(result.nextCursor).toBe(id(4));
  expect(result.data[0]).toMatchObject({ recipientCount: 0, cityId: id(9), branchIds: [] });
  expect(mocks.lock).toHaveBeenCalledWith(s.transaction, actor, 'support', expect.any(Function));
  const predicate = s.predicates.find((p) => p.table === announcements)?.value;
  expect(predicate && new PgDialect().sqlToQuery(predicate).params).toEqual(['sent', id(6)]);
  expect(s.operations).toContainEqual({ table: announcements, kind: 'limit', args: [3] });
});
it('GEO-003: Root list includes withdrawn identities and exact aliases without widening public discovery', async () => {
  s.enqueue(places, [institution(5), institution(6)]);
  s.enqueue(placeAliases, [{ alias: 'Institute alias' }]);
  const result = await new AdminReferenceReadService(s.database).institutions(actor, {
    active: 'inactive',
    limit: 1,
    cursor: id(4),
    q: '%_',
    type: 'university',
  });
  expect(result.nextCursor).toBe(id(5));
  expect(result.data[0]).toMatchObject({
    isActive: false,
    publicApproved: false,
    aliases: ['Institute alias'],
  });
  const predicate = s.predicates.find((p) => p.table === places)?.value;
  expect(predicate && new PgDialect().sqlToQuery(predicate).params).toEqual([
    'university',
    false,
    '%\\%\\_%',
    id(4),
  ]);
  expect(mocks.lock).toHaveBeenCalledWith(s.transaction, actor, 'root', expect.any(Function));
});
it('SEC-003: revoked or Normal reader denied before announcement or institution disclosure', async () => {
  mocks.lock.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Denied'));
  const service = new AdminReferenceReadService(s.database);
  await expect(service.announcements(actor, {})).rejects.toMatchObject({ status: 403 });
  await expect(service.institutions(actor, {})).rejects.toMatchObject({ status: 403 });
  expect(s.operations).toEqual([]);
});
it('GEO-003: direct place reader rejects missing targets (CHG-034: any category)', async () => {
  s.enqueue(places, []);
  await expect(
    new AdminReferenceReadService(s.database).institution(actor, id(5)),
  ).rejects.toMatchObject({ status: 404 });
});
it('HMA-015: institution history projects only governed values and restricts every page to Root', async () => {
  const { id: _id, revision: _revision, ...values } = institution(5);
  void _id;
  void _revision;
  const snapshot = { ...values, aliases: ['Verified alias'] };
  s.enqueue(platformAuditLog, [
    {
      id: 42n,
      actorId: actor.userId,
      createdAt: now,
      before: { institution: snapshot },
      after: {
        institution: { ...snapshot, latitude: 34 },
        reason: 'Verified campus move',
        previousRevision: '41',
        approval: 'reapproved',
        privateSecret: 'never-project',
      },
    },
  ]);
  const result = await new AdminReferenceReadService(s.database).institutionHistory(actor, id(5), {
    cursor: '43',
    limit: 1,
  });
  expect(result.data[0]).toMatchObject({
    revision: '42',
    previousRevision: '41',
    reason: 'Verified campus move',
    changedFields: ['latitude'],
    approval: 'reapproved',
  });
  expect(JSON.stringify(result)).not.toContain('never-project');
  expect(mocks.lock).toHaveBeenCalledWith(s.transaction, actor, 'root', expect.any(Function));
  mocks.lock.mockRejectedValue(new DomainError('FORBIDDEN', 403, 'Denied'));
  await expect(
    new AdminReferenceReadService(s.database).institutionHistory(actor, id(5), {}),
  ).rejects.toMatchObject({ status: 403 });
});
