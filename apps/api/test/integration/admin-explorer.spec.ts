import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  adminAccounts,
  adminRoleGrants,
  brands,
  branches,
  complaints,
  customerProfiles,
  files,
  managerAssignments,
  organizations,
  ownerProfiles,
  platformAuditLog,
  residentPayments,
  residentLedger,
  residentPaymentReversals,
  residentReceipts,
  residents,
  rooms,
  roomTypes,
  inventoryClaims,
  stayAssignments,
  stays,
  users,
} from '@hsm/db';
import { AdminExplorerService } from '../../src/admin/explorer.service.js';
import { AuditWriter } from '../../src/audit/writer.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
let f: Awaited<ReturnType<typeof authFixture>>;
const root = randomUUID(),
  normal = randomUUID(),
  owner = randomUUID(),
  manager = randomUUID(),
  customer = randomUUID();
const business = randomUUID(),
  organization = randomUUID(),
  branch = randomUUID(),
  secondBranch = randomUUID();
const now = new Date('2026-10-31T07:00:00Z');
let rootHeader: string, normalHeader: string, ownerHeader: string, managerHeader: string;
const get = (path: string, authorization = rootHeader) =>
  f.application.inject({ url: '/v1/admin/explorer/' + path, headers: { authorization } });
beforeAll(async () => {
  f = await authFixture(new AuthCrypto(testKeys()), now, {}, [], (db) => ({
    adminExplorer: new AdminExplorerService(db, () => now),
  }));
  const db = f.connection.db;
  await db.insert(users).values([
    { id: root, fullName: 'Directory Root', createdAt: now },
    { id: normal, fullName: 'Directory moderator', createdAt: now },
    {
      id: owner,
      fullName: 'Cohort Owner',
      email: 'must-not-expose@example.test',
      passwordHash: 'must-not-expose',
      createdAt: new Date('2025-01-01T00:00:00Z'),
    },
    { id: manager, fullName: 'Cohort Manager', createdAt: new Date('2026-07-01T00:00:00Z') },
    { id: customer, fullName: 'Cohort Same', createdAt: new Date('2026-09-30T19:00:00Z') },
    { id: randomUUID(), fullName: 'Cohort Same', createdAt: now },
  ]);
  await db.insert(adminAccounts).values([
    { userId: root, isRoot: true, status: 'active' },
    { userId: normal, isRoot: false, status: 'active' },
  ]);
  await db
    .insert(adminRoleGrants)
    .values({ adminUserId: normal, role: 'content_moderator', grantedByUserId: root });
  await db.insert(customerProfiles).values({ userId: customer });
  const front = randomUUID(),
    back = randomUUID();
  await db.insert(files).values(
    [front, back].map((id) => ({
      id,
      uploadedBy: owner,
      bucket: 'private-test',
      objectKey: 'private/verification_document/' + id + '/' + randomUUID(),
      mimeType: 'application/pdf',
      sizeBytes: 2n,
      purpose: 'verification_document' as const,
      scanStatus: 'clean' as const,
      visibility: 'private' as const,
      sha256: Buffer.alloc(32),
    })),
  );
  await db.insert(ownerProfiles).values({
    userId: owner,
    cnicFrontFileId: front,
    cnicBackFileId: back,
    address: 'Private permanent address',
    agreementVersion: 'owner-foundation-v1',
    agreementAcceptedAt: now,
    profileCompletedAt: now,
  });
  await db
    .insert(organizations)
    .values({ id: organization, ownerUserId: owner, name: 'Hostel organization' });
  await db
    .insert(brands)
    .values({ id: business, organizationId: organization, name: 'Multi branch business' });
  await db.insert(branches).values(
    [branch, secondBranch].map((id, index) => ({
      id,
      organizationId: organization,
      brandId: business,
      name: 'Branch ' + index,
      slug: id,
    })),
  );
  await db.insert(managerAssignments).values({
    userId: manager,
    branchId: branch,
    status: 'active',
    activatedAt: now,
    appointedByUserId: owner,
  });
  rootHeader = 'Bearer ' + (await f.service.issue(root, 'mobile')).accessToken;
  normalHeader = 'Bearer ' + (await f.service.issue(normal, 'mobile')).accessToken;
  ownerHeader = 'Bearer ' + (await f.service.issue(owner, 'mobile')).accessToken;
  managerHeader = 'Bearer ' + (await f.service.issue(manager, 'mobile')).accessToken;
});
afterAll(async () => {
  await f?.close();
});
it('HMA-017 SEC-003: Root-only metadata directory denies every other role and excludes private identity fields', async () => {
  for (const header of [normalHeader, ownerHeader, managerHeader])
    expect((await get('users', header)).statusCode).toBe(403);
  const response = await get('users');
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  for (const secret of [
    'must-not-expose',
    'Private permanent address',
    'passwordHash',
    'email',
    'cnic',
    'proofFile',
  ])
    expect(response.body).not.toContain(secret);
  expect((await get('users?unexpected=true')).statusCode).toBe(400);
});
it('HMA-017: complete calendar-cohort counts and duplicate-name keyset pages respect filters', async () => {
  const first = await get('users?q=Cohort&sort=name_asc&limit=1');
  expect(first.statusCode).toBe(200);
  expect(first.json().statistics).toEqual({ month: 2, quarter: 2, year: 3, lifetime: 4 });
  let page = first.json();
  const ids: string[] = [];
  for (let index = 0; index < 5; index++) {
    ids.push(...page.data.map((row: { id: string }) => row.id));
    if (!page.nextCursor) break;
    const next = await get(
      'users?q=Cohort&sort=name_asc&limit=1&cursor=' + encodeURIComponent(page.nextCursor),
    );
    expect(next.statusCode).toBe(200);
    page = next.json();
  }
  expect(ids).toHaveLength(4);
  expect(new Set(ids).size).toBe(4);
  expect((await get('users?q=Cohort%25')).json().totalCount).toBe(0);
  expect((await get('users?q=Cohort&period=month')).json().totalCount).toBe(2);
  expect(
    (
      await get(
        'users?q=changed&sort=name_asc&cursor=' + encodeURIComponent(first.json().nextCursor),
      )
    ).statusCode,
  ).toBe(400);
});
it('HMA-017 BRN-001 SEC-003: one hostel has multiple scoped branches and owner/manager profiles drill into existing relationships', async () => {
  const hostels = await get('hostels?ownerId=' + owner);
  expect(hostels.statusCode).toBe(200);
  expect(hostels.json().data.map((row: { id: string }) => row.id)).toEqual([business]);
  const pending = await get('branches?status=pending');
  expect(pending.statusCode).toBe(200);
  expect(pending.json().data).toEqual([]);
  const children = await get('branches?parentId=' + business);
  expect(children.statusCode).toBe(200);
  expect(children.json().data).toHaveLength(2);
  expect(
    (await get('branches?managerId=' + manager)).json().data.map((row: { id: string }) => row.id),
  ).toEqual([branch]);
  for (const kind of ['users', 'owners', 'managers'])
    expect((await get(kind + '/' + (kind === 'managers' ? manager : owner))).statusCode).toBe(200);
  const profile = (await get('hostels/' + business)).json();
  expect(profile.links).toContainEqual({
    label: 'All branches of this hostel',
    kind: 'branches',
    parentId: business,
  });
  expect((await get('users/' + owner)).json().action).toBe('none');
  expect((await get('users/' + customer)).json().action).toBe('customer_governance');
  expect((await get('users/' + root)).json().action).toBe('none');
  const [audit] = await f.connection.db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.targetId, business));
  expect(audit?.action).toBe('directory.profile_viewed');
});
it('HMA-017 PAY-008 RES-004: real occupancy and receipted non-reversed payment aggregates omit resident evidence', async () => {
  const db = f.connection.db,
    resident = randomUUID(),
    stay = randomUUID(),
    roomType = randomUUID(),
    room = randomUUID(),
    payment = randomUUID();
  await db.insert(roomTypes).values({
    id: roomType,
    branchId: branch,
    name: 'Private type',
    inventoryMode: 'whole_room',
    capacity: 1,
    roomMonthlyRentPaisa: 10000n,
    depositPaisa: 0n,
  });
  await db.insert(rooms).values({
    id: room,
    branchId: branch,
    roomTypeId: roomType,
    label: 'Private room',
    status: 'active',
  });
  await db.insert(residents).values({
    id: resident,
    branchId: branch,
    userId: customer,
    displayName: 'Never disclose resident',
    createdByUserId: owner,
  });
  await db.insert(stays).values({
    id: stay,
    branchId: branch,
    residentId: resident,
    userId: customer,
    source: 'manual',
    state: 'active',
    moveInDate: '2026-10-31',
    expectedLeaveDate: '2026-12-01',
    checkedInAt: now,
    createdByUserId: owner,
  });
  const assignment = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(stayAssignments).values({
      id: assignment,
      branchId: branch,
      stayId: stay,
      roomTypeId: roomType,
      roomId: room,
      startedAt: now,
      reason: 'Private assignment reason',
      createdByUserId: owner,
    });
    await tx.insert(inventoryClaims).values({
      branchId: branch,
      roomId: room,
      assignmentId: assignment,
      moveInDate: '2026-10-31',
      moveOutDate: '2026-12-01',
    });
  });
  await db.insert(complaints).values({
    branchId: branch,
    stayId: stay,
    userId: customer,
    category: 'wifi',
    title: 'Private resident title',
    description: 'Private complaint evidence',
    status: 'open',
    version: 1,
  });
  const paymentRow = {
    id: payment,
    branchId: branch,
    stayId: stay,
    sourceKey: 'fixture-payment',
    amountPaisa: 12345n,
    method: 'cash' as const,
    paidOn: '2026-10-31',
    approvedByUserId: owner,
    approvedAt: now,
    note: 'Private financial note',
  };
  await expect(db.insert(residentPayments).values(paymentRow)).rejects.toBeDefined();
  expect((await get('payments')).json().quantity).toBe(0);
  const posting = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(residentPayments).values(paymentRow);
    await tx.insert(residentLedger).values({
      id: posting,
      branchId: branch,
      stayId: stay,
      paymentId: payment,
      fundingPaymentId: payment,
      account: 'advance',
      side: 'credit',
      amountPaisa: 12345n,
      postedAt: now,
    });
    await tx.insert(residentReceipts).values({
      branchId: branch,
      stayId: stay,
      paymentId: payment,
      number: 'FIXTURE-1',
      snapshot: {
        version: 1,
        currency: 'PKR',
        paymentId: payment,
        branchId: branch,
        stayId: stay,
        residentName: 'Never disclose resident',
        hostelName: 'Multi branch business',
        branchName: 'Branch 0',
        amountPaisa: 12345,
        method: 'cash',
        transactionReference: null,
        paidOn: '2026-10-31',
        approvedAt: now.toISOString(),
        allocations: [],
        distribution: { allocatedPaisa: 0, depositPaisa: 0, advanceCreditPaisa: 12345 },
      },
    });
  });
  const payments = await get('payments?period=month');
  expect(payments.statusCode).toBe(200);
  expect(payments.json()).toMatchObject({
    quantity: 1,
    amountPaisa: '12345',
    statistics: { month: 1, quarter: 1, year: 1, lifetime: 1 },
  });
  const occupancy = await get('occupancy');
  expect(occupancy.statusCode).toBe(200);
  expect(occupancy.json().quantity).toBe(1);
  const feedback = await get('complaints');
  expect(feedback.statusCode).toBe(200);
  expect(feedback.json().data[0]).toMatchObject({ reason: 'wifi', status: 'open' });
  for (const response of [payments, occupancy, feedback])
    for (const secret of [
      'Never disclose',
      'Private resident',
      'Private complaint',
      'Private financial',
      'stayId',
      'userId',
      'proofFileId',
    ])
      expect(response.body).not.toContain(secret);
  const reversal = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(residentPaymentReversals).values({
      id: reversal,
      branchId: branch,
      stayId: stay,
      paymentId: payment,
      reason: 'Reverse fixture',
      approvedByUserId: owner,
    });
    await tx.insert(residentLedger).values({
      branchId: branch,
      stayId: stay,
      paymentReversalId: reversal,
      fundingPaymentId: payment,
      reversedEntryId: posting,
      account: 'advance',
      side: 'debit',
      amountPaisa: 12345n,
      postedAt: now,
    });
  });
  expect((await get('payments')).json().quantity).toBe(0);
});
it('HMA-017 SEC-003: audit failure prevents disclosure and missing records fail closed', async () => {
  expect((await get('users/' + randomUUID())).statusCode).toBe(404);
  const spy = vi
    .spyOn(AuditWriter.prototype, 'platform')
    .mockRejectedValueOnce(new Error('private SQL binding must not escape'));
  try {
    const response = await get('users/' + owner);
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('private SQL');
  } finally {
    spy.mockRestore();
  }
  const summary = await get('summary');
  expect(summary.statusCode).toBe(200);
  expect(summary.json().counts).toMatchObject({ hostels: 1, branches: 2, owners: 1, managers: 1 });
});
