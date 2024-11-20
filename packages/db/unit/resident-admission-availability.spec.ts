import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { PostingTransaction } from '../src/resident-posting-context.js';
import { inventoryClaims } from '../src/schema/index.js';
import { requireResidentAdmissionAvailable } from '../src/resident-admission-availability.js';
const branchId = randomUUID(),
  roomId = randomUUID(),
  bedId = randomUUID();
const now = new Date('2028-02-01T19:30:00Z'); // Karachi admission date is February2.
const input = { branchId, target: { kind: 'bed', roomId, bedId }, expectedLeaveDate: '2028-03-01' };
function fixture(conflict = false) {
  const limit = vi.fn().mockResolvedValue(conflict ? [{ id: randomUUID() }] : []);
  const where = vi.fn<(predicate: SQL) => { limit: typeof limit }>().mockReturnValue({ limit });
  const from = vi.fn<(table: unknown) => { where: typeof where }>().mockReturnValue({ where });
  const select = vi.fn(() => ({ from }));
  return { tx: { select } as unknown as PostingTransaction, select, from, where, limit };
}
it.each(['bed', 'room'])(
  'STAY-001 / ACC-001: %s actual admission uses exact branch/room, live expiry and bounded overlapping claims including all physical assignments',
  async (kind) => {
    const f = fixture(),
      target = kind === 'bed' ? input.target : { kind: 'room', roomId };
    expect(
      await requireResidentAdmissionAvailable(
        f.tx,
        { ...input, branchId: branchId.toUpperCase(), target },
        now,
      ),
    ).toEqual({ admittedOn: '2028-02-02' });
    expect(f.from).toHaveBeenCalledWith(inventoryClaims);
    expect(f.limit).toHaveBeenCalledExactlyOnceWith(1);
    const predicate = f.where.mock.calls[0]?.[0];
    if (!predicate) throw Error('Scoped predicate missing');
    const query = new PgDialect().sqlToQuery(predicate);
    expect(query.params).toEqual([
      branchId,
      roomId,
      now.toISOString(),
      ...(kind === 'bed' ? [bedId] : []),
      '2028-03-01',
      '2028-02-02',
    ]);
    expect(query.sql).toContain('"released_at" is null');
    expect(query.sql).toContain('"expires_at" is null');
    expect(query.sql).toContain('"assignment_id" is not null');
    expect(query.sql).toContain('"move_in_date" <');
    expect(query.sql).toContain('"move_out_date" >');
    if (kind === 'bed') expect(query.sql).toContain('"seat_id" is null');
    else expect(query.sql).not.toContain('"seat_id"');
  },
);
it.each(['bed', 'room'])(
  'RES-004 / ACC-001: open-ended %s admission has no artificial future sentinel',
  async (kind) => {
    const f = fixture(),
      target = kind === 'bed' ? input.target : { kind: 'room', roomId };
    await requireResidentAdmissionAvailable(
      f.tx,
      { ...input, target, expectedLeaveDate: null },
      now,
    );
    const predicate = f.where.mock.calls[0]?.[0];
    if (!predicate) throw Error('Scoped predicate missing');
    const query = new PgDialect().sqlToQuery(predicate);
    expect(query.params).toEqual([
      branchId,
      roomId,
      now.toISOString(),
      ...(kind === 'bed' ? [bedId] : []),
      '2028-02-02',
    ]);
    expect(query.sql).not.toContain('"move_in_date" <');
    expect(query.sql).toContain('"assignment_id" is not null');
  },
);
it('RES-004 / ACC-001: a reserved or still physically occupied target rejects admission without writing', async () => {
  const f = fixture(true);
  await expect(requireResidentAdmissionAvailable(f.tx, input, now)).rejects.toMatchObject({
    code: 'CONFLICT',
    status: 409,
  });
  expect(f.limit).toHaveBeenCalledExactlyOnceWith(1);
});
it.each(['2028-02-01', '2028-02-02'])(
  'STAY-001: planned end %s cannot produce a zero or negative actual occupancy interval',
  async (expectedLeaveDate) => {
    const f = fixture();
    await expect(
      requireResidentAdmissionAvailable(f.tx, { ...input, expectedLeaveDate }, now),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(f.select).not.toHaveBeenCalled();
  },
);
it.each([
  { branchId: 'bad' },
  { target: { ...input.target, bedId: 'bad' } },
  { target: { ...input.target, roomId: 'bad' } },
  { target: { kind: 'all', roomId } },
  { expectedLeaveDate: '2028-02-30' },
  { expectedLeaveDate: '10000-01-01' },
  { ignoreBookingId: randomUUID() },
  { ignoreAssignmentId: randomUUID() },
  { actorRole: 'owner' },
  { target: { ...input.target, branchId: randomUUID() } },
])(
  'SEC-003: invalid scope/date or injected reservation bypass %# rejects before reads',
  async (patch) => {
    const f = fixture();
    await expect(
      requireResidentAdmissionAvailable(f.tx, { ...input, ...patch }, now),
    ).rejects.toThrow();
    expect(f.select).not.toHaveBeenCalled();
  },
);
it('SEC-003: an invalid server clock cannot produce an admission date or query', async () => {
  const f = fixture();
  await expect(
    requireResidentAdmissionAvailable(f.tx, input, new Date(Number.NaN)),
  ).rejects.toThrow();
  expect(f.select).not.toHaveBeenCalled();
});
