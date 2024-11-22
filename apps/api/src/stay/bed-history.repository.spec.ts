import { describe, expect, it, vi } from 'vitest';
import { seats, stayAssignments } from '@hsm/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { readBedHistory } from './bed-history.repository.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const roomId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const actor = { userId: branchId, sessionId: bedId };
const now = new Date('2026-11-01T10:00:00.000Z');
describe('BED-002 / RES-005 history scope', () => {
  it('keeps original stay identity and uses a bounded stable date/id cursor', async () => {
    vi.mocked(lockInventoryScope).mockResolvedValue({
      organizationId: branchId,
      brandId: branchId,
      ownerId: branchId,
      actorRole: 'owner',
    });
    vi.mocked(lockActor).mockClear();
    const f = queryFixture();
    f.enqueue(seats, [{ roomId }]);
    const row = {
      assignmentId: bedId,
      stayId: roomId,
      residentName: 'Former resident',
      startedAt: now,
      endedAt: now,
      seatId: bedId,
    };
    f.enqueue(stayAssignments, [row, { ...row, assignmentId: roomId }]);
    const cursor = now.toISOString() + '|' + roomId;
    const page = await readBedHistory(
      f.database,
      actor,
      branchId,
      bedId,
      { limit: 1, cursor },
      () => now,
    );
    expect(page.data[0]).toMatchObject({
      stayId: roomId,
      wholeRoom: false,
      endedAt: now.toISOString(),
    });
    expect(page.nextCursor).toBe(now.toISOString() + '|' + bedId);
    expect(lockActor).toHaveBeenCalledTimes(2);
    expect(lockInventoryScope).toHaveBeenCalledWith(f.transaction, actor, branchId, 'stay_manage');
    const predicate = f.predicates.find((item) => item.table === stayAssignments);
    expect(predicate).toBeDefined();
    if (!predicate) throw new Error('Missing history scope');
    expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual(
      expect.arrayContaining([branchId, roomId, bedId]),
    );
    expect(f.operations).toContainEqual({ table: stayAssignments, kind: 'limit', args: [2] });
    expect(f.writes).toEqual([]);
  });
  it('denies before records are queried when the live grant is missing', async () => {
    vi.mocked(lockInventoryScope).mockRejectedValueOnce(new Error('Denied'));
    const f = queryFixture();
    await expect(
      readBedHistory(f.database, actor, branchId, bedId, { limit: 20 }, () => now),
    ).rejects.toThrow('Denied');
    expect(f.predicates).toEqual([]);
  });
  it('never returns a bed from another branch', async () => {
    const f = queryFixture();
    await expect(
      readBedHistory(f.database, actor, branchId, bedId, { limit: 20 }, () => now),
    ).rejects.toMatchObject({ status: 404 });
  });
});
