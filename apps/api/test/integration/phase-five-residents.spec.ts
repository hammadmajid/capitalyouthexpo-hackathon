import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import {
  agreementAcceptances,
  hostelAuditLog,
  inventoryClaims,
  residents,
  stayAssignments,
  stays,
} from '@hsm/db';
import {
  bedOccupancySchema,
  agreementAcceptanceSchema,
  manualAdmissionResultSchema,
  occupancyPageSchema,
  residentDirectoryPageSchema,
  residentProfileSchema,
  stayRecordSchema,
} from '@hsm/contracts';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { admitResident, manualAdmissionFixture } from './manual-admission.fixture.js';
let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
beforeAll(async () => {
  f = await phaseTwoFixture(new Date('2026-10-25T10:00:00Z'));
});
afterAll(async () => {
  await f?.close();
});
function get(url: string, token = f.ownerToken) {
  return f.application.inject({ url, headers: { authorization: 'Bearer ' + token } });
}
async function ok(url: string, token = f.ownerToken) {
  const response = await get(url, token);
  expect(response.statusCode, response.body).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  return response.json() as unknown;
}
// Close a Stay the way checkout eventually will: end assignment, release claim, close.
async function close(stayId: string) {
  const ended = new Date('2026-10-25T11:00:00Z');
  await f.connection.db.transaction(async (tx) => {
    const ends = await tx
      .update(stayAssignments)
      .set({ endedAt: ended })
      .where(and(eq(stayAssignments.stayId, stayId), isNull(stayAssignments.endedAt)))
      .returning({ id: stayAssignments.id });
    for (const assignment of ends)
      await tx
        .update(inventoryClaims)
        .set({ releasedAt: ended })
        .where(eq(inventoryClaims.assignmentId, assignment.id));
    await tx
      .update(stays)
      .set({ state: 'completed', closedAt: ended, version: 2 })
      .where(eq(stays.id, stayId));
  });
}
it('RES-004 / STAY-002 / BED-002: directory, profile, Stay record and bed detail read real lineage', async () => {
  const item = await manualAdmissionFixture(f);
  const first = await admitResident(f, item);
  expect(first.statusCode, first.body).toBe(201);
  const offline = manualAdmissionResultSchema.parse(first.json());
  const linkedId = randomUUID(),
    noneId = randomUUID();
  await f.connection.db.insert(residents).values([
    {
      id: linkedId,
      branchId: item.branchId,
      userId: f.customerB,
      displayName: 'Existing linked',
      createdByUserId: f.ownerId,
    },
    {
      id: noneId,
      branchId: item.branchId,
      userId: null,
      displayName: 'Zero stays',
      createdByUserId: f.ownerId,
    },
  ]);
  const second = await admitResident(f, item, randomUUID(), f.ownerToken, {
    ...item.input,
    manual: {
      ...item.input.manual,
      resident: { kind: 'existing', residentId: linkedId },
      target: { kind: 'bed', roomId: item.roomId, bedId: item.otherSeatId },
    },
  });
  expect(second.statusCode, second.body).toBe(201);
  const linked = manualAdmissionResultSchema.parse(second.json());
  // CHG-012: the linked account reads its own Stay record; another account cannot.
  const own = stayRecordSchema.parse(
    await ok(`/v1/me/stays/${linked.stayId}/record`, f.customerBToken),
  );
  expect(own.assignments[0]).toMatchObject({ bedId: item.otherSeatId, endedAt: null });
  expect((await get(`/v1/me/stays/${linked.stayId}/record`, f.customerAToken)).statusCode).toBe(
    404,
  );
  const agreement = own.agreements[0];
  if (!agreement?.termsDigest) throw new Error('Original terms digest missing');
  const acceptanceUrl = `/v1/me/stays/${linked.stayId}/agreements/${agreement.id}/acceptance`;
  const key = randomUUID();
  const accept = (token: string, digest = agreement.termsDigest, requestKey = key) =>
    f.application.inject({
      method: 'PUT',
      url: acceptanceUrl,
      headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': requestKey },
      payload: { version: agreement.version, termsDigest: digest, acknowledged: true },
    });
  expect((await accept(f.customerAToken)).statusCode).toBe(404);
  expect((await accept(f.customerBToken, 'f'.repeat(64), randomUUID())).statusCode).toBe(412);
  const accepted = await accept(f.customerBToken);
  expect(accepted.statusCode, accepted.body).toBe(200);
  const evidence = agreementAcceptanceSchema.parse(accepted.json());
  expect(evidence).toMatchObject({
    stayId: linked.stayId,
    agreementId: agreement.id,
    acceptedByUserId: f.customerB,
    termsDigest: agreement.termsDigest,
    method: 'authenticated_acknowledgement',
  });
  await expect(
    f.connection.db
      .update(agreementAcceptances)
      .set({ termsDigest: 'f'.repeat(64) })
      .where(eq(agreementAcceptances.id, evidence.id)),
  ).rejects.toThrow();
  const replay = await accept(f.customerBToken);
  expect(replay.statusCode, replay.body).toBe(200);
  expect(agreementAcceptanceSchema.parse(replay.json()).id).toBe(evidence.id);
  const acknowledged = stayRecordSchema.parse(
    await ok(`/v1/me/stays/${linked.stayId}/record`, f.customerBToken),
  );
  expect(acknowledged.agreements[0]?.acknowledgements?.[0]?.id).toBe(evidence.id);
  await close(linked.stayId);
  const base = `/v1/branches/${item.branchId}`;
  // RES-004: one row per resident, current/former/none from real Stays.
  const directory = residentDirectoryPageSchema.parse(await ok(base + '/residents'));
  expect(directory.data.map((row) => [row.displayName, row.status, row.linked])).toEqual([
    ['Existing linked', 'former', true],
    ['Offline admission', 'current', false],
    ['Zero stays', 'none', false],
  ]);
  expect(directory.data[1]?.currentStay).toMatchObject({
    id: offline.stayId,
    state: 'active',
    bedLabel: 'A',
  });
  const filtered = async (query: string) =>
    residentDirectoryPageSchema
      .parse(await ok(base + '/residents?' + query))
      .data.map((row) => row.displayName);
  expect(await filtered('status=current')).toEqual(['Offline admission']);
  expect(await filtered('status=former')).toEqual(['Existing linked']);
  expect(await filtered('linked=false&status=none')).toEqual(['Zero stays']);
  expect(await filtered('q=offl')).toEqual(['Offline admission']);
  expect(await filtered('q=%25')).toEqual([]);
  const page1 = residentDirectoryPageSchema.parse(await ok(base + '/residents?limit=2'));
  const page2 = residentDirectoryPageSchema.parse(
    await ok(base + '/residents?limit=2&cursor=' + (page1.nextCursor ?? '')),
  );
  expect([...page1.data, ...page2.data].map((row) => row.id).sort()).toEqual(
    directory.data.map((row) => row.id).sort(),
  );
  expect(page2.nextCursor).toBeNull();
  const newest = residentDirectoryPageSchema.parse(await ok(base + '/residents?sort=newest'));
  expect(newest.data).toHaveLength(3);
  const profile = residentProfileSchema.parse(await ok(base + '/residents/' + linkedId));
  expect(profile).toMatchObject({ linked: true, status: 'former', currentStay: null });
  expect(profile.stays.map((stay) => stay.state)).toEqual(['completed']);
  expect((await get(base + '/residents/' + randomUUID())).statusCode).toBe(404);
  // STAY-002: the record keeps the original agreement snapshot and labelled assignment.
  const record = stayRecordSchema.parse(await ok(`${base}/stays/${offline.stayId}/record`));
  expect(record.branch.id).toBe(item.branchId);
  expect(record.agreements).toHaveLength(1);
  expect(record.agreements[0]).toMatchObject({
    version: 1,
    fromBooking: false,
    terms: { rentAmountPaisa: 1800001, depositPaisa: 1000001 },
  });
  expect(record.assignments[0]).toMatchObject({ bedLabel: 'A', endedAt: null });
  expect(record.history[0]).toMatchObject({ previousState: null, nextState: 'active' });
  expect(JSON.stringify(record)).not.toContain(f.ownerId);
  expect(record.truncated).toBe(false);
  // BED-002: the bed detail matches the Bed Board and lists its covering claim.
  const bed = bedOccupancySchema.parse(await ok(`${base}/occupancy/beds/${item.seatId}`));
  expect(bed.bed).toMatchObject({ state: 'occupied', occupant: { stayId: offline.stayId } });
  expect(bed.claims).toEqual([
    expect.objectContaining({ source: 'assignment', stayId: offline.stayId, wholeRoom: false }),
  ]);
  const freed = bedOccupancySchema.parse(await ok(`${base}/occupancy/beds/${item.otherSeatId}`));
  expect(freed.bed.state).toBe('available');
  expect(freed.claims).toEqual([]);
  const occupiedOnly = occupancyPageSchema.parse(await ok(base + '/occupancy?state=occupied'));
  expect(occupiedOnly.data.flatMap((room) => room.beds.map((one) => one.id))).toEqual([
    item.seatId,
  ]);
  expect(occupiedOnly.totals.beds).toBeGreaterThanOrEqual(2);
  const otherRoom = occupancyPageSchema.parse(await ok(base + '/occupancy?roomId=' + randomUUID()));
  expect(otherRoom.data).toEqual([]);
  expect((await get(`${base}/occupancy/beds/${randomUUID()}`)).statusCode).toBe(404);
});
it('RES-004 / ACC-002: resident, record and bed reads require stay_manage in the exact branch', async () => {
  const item = await manualAdmissionFixture(f),
    foreign = await f.inventory();
  const admitted = manualAdmissionResultSchema.parse((await admitResident(f, item)).json());
  for (const url of [
    `/v1/branches/${item.branchId}/residents`,
    `/v1/branches/${item.branchId}/residents/${admitted.residentId}`,
    `/v1/branches/${item.branchId}/stays/${admitted.stayId}/record`,
    `/v1/branches/${item.branchId}/occupancy/beds/${item.seatId}`,
  ])
    expect((await get(url, f.customerAToken)).statusCode, url).toBe(403);
  // Branch isolation: the resident exists, but not in the foreign branch.
  expect(
    (await get(`/v1/branches/${foreign.branchId}/residents/${admitted.residentId}`)).statusCode,
  ).toBe(404);
  expect(
    (await get(`/v1/branches/${foreign.branchId}/stays/${admitted.stayId}/record`)).statusCode,
  ).toBe(404);
  expect((await get(`/v1/branches/${item.branchId}/residents?limit=51`)).statusCode).toBe(400);
});
function put(url: string, payload: unknown, token = f.ownerToken) {
  return f.application.inject({
    method: 'PUT',
    url,
    headers: { authorization: 'Bearer ' + token },
    payload: payload as Record<string, unknown>,
  });
}
it('RES-006 / ACC-006 / SEC-001: owner corrects an offline resident; audited, scoped, linked refused', async () => {
  const item = await manualAdmissionFixture(f),
    foreign = await f.inventory();
  const admitted = manualAdmissionResultSchema.parse((await admitResident(f, item)).json());
  const url = `/v1/branches/${item.branchId}/residents/${admitted.residentId}/contact`;
  const body = {
    displayName: 'Corrected Name',
    phone: '+923001234567',
    email: 'Fixed@Example.com',
  };
  const saved = await put(url, body);
  expect(saved.statusCode, saved.body).toBe(200);
  expect(saved.json()).toMatchObject({ displayName: 'Corrected Name', email: 'fixed@example.com' });
  const [row] = await f.connection.db
    .select()
    .from(residents)
    .where(eq(residents.id, admitted.residentId));
  expect(row).toMatchObject({ displayName: 'Corrected Name', phone: '+923001234567' });
  const audit = await f.connection.db
    .select()
    .from(hostelAuditLog)
    .where(
      and(
        eq(hostelAuditLog.targetId, admitted.residentId),
        eq(hostelAuditLog.action, 'resident.contact.updated'),
      ),
    );
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({ branchId: item.branchId, actorRole: 'owner' });
  // Default deny for other roles, branch isolation and strict input.
  expect((await put(url, body, f.customerAToken)).statusCode).toBe(403);
  expect(
    (await put(`/v1/branches/${foreign.branchId}/residents/${admitted.residentId}/contact`, body))
      .statusCode,
  ).toBe(404);
  expect((await put(url, { ...body, userId: admitted.residentId })).statusCode).toBe(400);
  // CHG-009: a linked resident keeps control of their own details.
  const linked = randomUUID();
  await f.connection.db.insert(residents).values({
    id: linked,
    branchId: item.branchId,
    userId: f.customerA,
    displayName: 'Linked',
    createdByUserId: f.ownerId,
  });
  const refused = await put(`/v1/branches/${item.branchId}/residents/${linked}/contact`, body);
  expect(refused.statusCode, refused.body).toBe(409);
});
