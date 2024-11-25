import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { residents, stays, users } from '@hsm/db';
import { phaseTwoFixture } from './phase-two-fixture.js';
import { admitResident, manualAdmissionFixture } from './manual-admission.fixture.js';

let f: Awaited<ReturnType<typeof phaseTwoFixture>>;
let at = new Date('2026-10-10T12:00:00Z');
beforeAll(async () => {
  f = await phaseTwoFixture(at, () => new Date(at), {
    preScannedInventory: true,
  });
}, 180000);
afterAll(async () => f?.close());

async function offline(phone: string, email?: string) {
  const item = await manualAdmissionFixture(f, null);
  const reference = item.input.manual.resident;
  if (reference.kind !== 'existing') throw new Error('Expected offline resident');
  await f.connection.db
    .update(residents)
    .set({ phone, email })
    .where(eq(residents.id, reference.residentId));
  const response = await admitResident(f, item);
  expect(response.statusCode).toBe(201);
  return {
    branchId: item.branchId,
    residentId: reference.residentId,
    stayId: response.json().stayId as string,
  };
}
async function customer() {
  const id = randomUUID();
  const [template] = await f.connection.db.select().from(users).where(eq(users.id, f.customerB));
  if (!template) throw new Error('Missing identity');
  await f.connection.db.insert(users).values({
    id,
    fullName: template.fullName,
    gender: 'male',
    email: id + '@example.test',
    emailVerifiedAt: f.now,
    passwordHash: template.passwordHash,
  });
  const session = await f.service.issue(id, 'mobile');
  return { id, token: session.accessToken, email: id + '@example.test' };
}
function decide(
  branch: string,
  requestId: string,
  action: 'approve' | 'reject',
  token = f.ownerToken,
) {
  return f.application.inject({
    method: 'PUT',
    url: `/v1/branches/${branch}/residents/account-link-requests/${requestId}`,
    headers: { authorization: 'Bearer ' + token },
    payload: { action },
  });
}
async function closed(stayId: string) {
  const [row] = await f.connection.db.select().from(stays).where(eq(stays.id, stayId));
  if (!row) throw new Error('Missing Stay');
  at = new Date(at.getTime() + 60000);
  const response = await f.application.inject({
    method: 'POST',
    url: `/v1/branches/${row.branchId}/stays/${stayId}/checkout`,
    headers: { authorization: 'Bearer ' + f.ownerToken, 'idempotency-key': randomUUID() },
    payload: { expectedVersion: row.version, reason: 'Left', applyAvailableDeposit: false },
  });
  expect(response.statusCode, response.body).toBe(200);
}
function save(phone: string, token = f.customerAToken) {
  return f.application.inject({
    method: 'PUT',
    url: '/v1/me/customer-profile',
    headers: { authorization: 'Bearer ' + token },
    payload: { fullName: 'Phase two fixture', gender: 'male', phone, age: 20 },
  });
}
function queue(branch: string, token = f.ownerToken) {
  return f.application.inject({
    method: 'GET',
    url: `/v1/branches/${branch}/residents/account-link-requests`,
    headers: { authorization: 'Bearer ' + token },
  });
}

it('RES-001 / ACC-004: phone match requests hostel approval and grants no private Stay before approval', async () => {
  const item = await offline('+923111234501');
  expect((await save('03111234501')).statusCode).toBe(200);
  const pending = await queue(item.branchId);
  expect(pending.statusCode).toBe(200);
  expect(pending.json().data).toHaveLength(1);
  const [before] = await f.connection.db.select().from(stays).where(eq(stays.id, item.stayId));
  expect(before?.userId).toBeNull();
  expect((await queue(item.branchId, f.customerAToken)).statusCode).toBe(403);
  const requestId = pending.json().data[0].id as string;
  expect((await decide(item.branchId, requestId, 'approve', f.customerAToken)).statusCode).toBe(
    403,
  );
  const another = await f.inventory();
  expect((await decide(another.branchId, requestId, 'approve')).statusCode).toBe(404);
  const approvals = await Promise.all([
    decide(item.branchId, requestId, 'approve'),
    decide(item.branchId, requestId, 'approve'),
  ]);
  expect(approvals.map((response) => response.statusCode)).toEqual([200, 200]);
  const mine = await f.application.inject({
    method: 'GET',
    url: '/v1/me/stays',
    headers: { authorization: 'Bearer ' + f.customerAToken },
  });
  expect(mine.json().data.some((row: { id: string }) => row.id === item.stayId)).toBe(true);
  const [linked] = await f.connection.db.select().from(stays).where(eq(stays.id, item.stayId));
  expect(linked?.userId).toBe(f.customerA);
  if (!before) throw new Error('Missing original Stay');
  expect(linked?.version).toBe(before.version + 1);
});

it('RES-001: checked-out residents never produce a phone request', async () => {
  const who = await customer(),
    item = await offline('+923111234502');
  await closed(item.stayId);
  expect((await save('03111234502', who.token)).statusCode).toBe(200);
  expect((await queue(item.branchId)).json().data).toEqual([]);
});
it('ACC-004: checkout after requesting makes approval unavailable and cannot grant access', async () => {
  const who = await customer(),
    item = await offline('+923111234503');
  expect((await save('03111234503', who.token)).statusCode).toBe(200);
  const requestId = (await queue(item.branchId)).json().data[0].id as string;
  await closed(item.stayId);
  expect((await queue(item.branchId)).json().data).toEqual([]);
  expect((await decide(item.branchId, requestId, 'approve')).statusCode).toBe(409);
  const [row] = await f.connection.db.select().from(stays).where(eq(stays.id, item.stayId));
  expect(row?.userId).toBeNull();
});
it('RES-001: verified email links directly, preserves the current Stay and is idempotent', async () => {
  const who = await customer(),
    item = await offline('+923111234504', who.email.toUpperCase());
  expect((await save('03111234505', who.token)).statusCode).toBe(200);
  const [first] = await f.connection.db.select().from(stays).where(eq(stays.id, item.stayId));
  expect(first?.userId).toBe(who.id);
  expect((await save('03111234505', who.token)).statusCode).toBe(200);
  const [second] = await f.connection.db.select().from(stays).where(eq(stays.id, item.stayId));
  expect(second?.version).toBe(first?.version);
  expect((await queue(item.branchId)).json().data).toEqual([]);
});
it('ACC-004: changing the phone invalidates a request; rejection cannot be retried into approval', async () => {
  const who = await customer(),
    item = await offline('+923111234506');
  await save('03111234506', who.token);
  const requestId = (await queue(item.branchId)).json().data[0].id as string;
  await save('03111234507', who.token);
  expect((await decide(item.branchId, requestId, 'approve')).statusCode).toBe(409);
  const other = await customer(),
    second = await offline('+923111234508');
  await save('03111234508', other.token);
  const rejectedId = (await queue(second.branchId)).json().data[0].id as string;
  expect((await decide(second.branchId, rejectedId, 'reject')).statusCode).toBe(200);
  await save('03111234508', other.token);
  expect((await queue(second.branchId)).json().data).toEqual([]);
  expect((await decide(second.branchId, rejectedId, 'approve')).statusCode).toBe(409);
});
it('ACC-004: conflicting phone and email residents never link or create requests', async () => {
  const who = await customer(),
    a = await offline('+923111234509'),
    b = await offline('+923111234510', who.email);
  expect((await save('03111234509', who.token)).statusCode).toBe(200);
  expect((await queue(a.branchId)).json().data).toEqual([]);
  expect((await queue(b.branchId)).json().data).toEqual([]);
});

it('ACC-004: direct verified-email linking supersedes a different phone claimant without merging accounts', async () => {
  const phoneUser = await customer(),
    emailUser = await customer(),
    item = await offline('+923111234511', emailUser.email);
  await save('03111234511', phoneUser.token);
  const requestId = (await queue(item.branchId)).json().data[0].id as string;
  await save('03111234512', emailUser.token);
  expect((await decide(item.branchId, requestId, 'approve')).statusCode).toBe(409);
  const [row] = await f.connection.db.select().from(stays).where(eq(stays.id, item.stayId));
  expect(row?.userId).toBe(emailUser.id);
  const privateRead = await f.application.inject({
    method: 'GET',
    url: `/v1/me/stays/${item.stayId}`,
    headers: { authorization: 'Bearer ' + phoneUser.token },
  });
  expect(privateRead.statusCode).toBe(404);
});
