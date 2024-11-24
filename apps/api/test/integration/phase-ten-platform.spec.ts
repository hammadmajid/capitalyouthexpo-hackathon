import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  adminAccounts,
  adminRoleGrants,
  announcements,
  branches,
  deliverAnnouncement,
  managerAssignments,
  managerInventoryGrants,
  notificationOutbox,
  notifications,
  platformAuditLog,
  residents,
  reviewRatings,
  reviews,
  stays,
  users,
} from '@hsm/db';
import { managerDashboardSchema, ownerDashboardSchema, reportSchema } from '@hsm/contracts';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';
const h = lifecycleHarness();
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
beforeAll(async () => {
  const f = await h.start();
  for (const name of ['root', 'verification', 'moderator', 'support']) ids[name] = randomUUID();
  await f.connection.db.insert(users).values(
    Object.entries(ids).map(([name, id]) => ({
      id,
      fullName: 'Admin ' + name,
      email: id + '@example.test',
      emailVerifiedAt: f.now,
    })),
  );
  await f.connection.db
    .insert(adminAccounts)
    .values({ userId: ids.root ?? '', isRoot: true, status: 'active' });
  for (const [name, role] of [
    ['verification', 'verification'],
    ['moderator', 'content_moderator'],
    ['support', 'support'],
  ] as const) {
    await f.connection.db
      .insert(adminAccounts)
      .values({ userId: ids[name] ?? '', status: 'active' });
    await f.connection.db
      .insert(adminRoleGrants)
      .values({ adminUserId: ids[name] ?? '', role, grantedByUserId: ids.root ?? '' });
  }
  for (const [name, id] of Object.entries(ids))
    tokens[name] = (await f.service.issue(id, 'mobile')).accessToken;
});
afterAll(() => h.close());
const as = (name: string) => tokens[name] ?? '';
it('ADM-001..006: only Root manages admins; Root stays between one and three; audit kept', async () => {
  const f = h.fixture();
  expect((await h.get('/v1/admin/admins', as('root'))).statusCode).toBe(200);
  expect((await h.get('/v1/admin/admins', as('verification'))).statusCode).toBe(403);
  expect(
    (
      await h.send(
        '/v1/admin/admins',
        { email: f.customerB + '@example.test', roles: ['support'] },
        as('support'),
      )
    ).statusCode,
  ).toBe(403);
  const invited = await h.ok(
    '/v1/admin/admins',
    { email: f.customerB + '@example.test', roles: ['support'] },
    as('root'),
  );
  expect(invited).toMatchObject({ status: 'invited', roles: ['support'], isRoot: false });
  expect((await h.get('/v1/admin/support-tickets', f.customerBToken)).statusCode).toBe(403);
  expect(await h.ok('/v1/admin/me/accept', {}, f.customerBToken)).toMatchObject({
    status: 'active',
  });
  expect((await h.get('/v1/admin/support-tickets', f.customerBToken)).statusCode).toBe(200);
  const change = (target: string, body: Record<string, unknown>) =>
    h.send(`/v1/admin/admins/${target}/changes`, body, as('root'));
  expect(
    (await change(ids.root ?? '', { change: 'root', isRoot: false, reason: 'Step down' }))
      .statusCode,
  ).toBe(409);
  expect(
    (await change(ids.root ?? '', { change: 'status', status: 'suspended', reason: 'x' }))
      .statusCode,
  ).toBe(409);
  for (const name of ['verification', 'moderator'])
    expect(
      (await change(ids[name] ?? '', { change: 'root', isRoot: true, reason: 'Promote' }))
        .statusCode,
    ).toBe(200);
  expect(
    (await change(ids.support ?? '', { change: 'root', isRoot: true, reason: 'Fourth' }))
      .statusCode,
  ).toBe(409);
  for (const name of ['verification', 'moderator'])
    expect(
      (await change(ids[name] ?? '', { change: 'root', isRoot: false, reason: 'Back' })).statusCode,
    ).toBe(200);
  // Suspension takes effect on the next request; roles change by Root only.
  expect(
    (await change(f.customerB, { change: 'status', status: 'suspended', reason: 'Leave' }))
      .statusCode,
  ).toBe(200);
  expect((await h.get('/v1/admin/support-tickets', f.customerBToken)).statusCode).toBe(403);
  const audit = await f.connection.db
    .select()
    .from(platformAuditLog)
    .where(eq(platformAuditLog.targetId, f.customerB));
  expect(audit.map((row) => row.action)).toEqual(
    expect.arrayContaining(['admin.invited', 'admin.accepted', 'admin.status']),
  );
});
it('ADM-007: verification decisions follow the state machine and need reasons; other roles are refused', async () => {
  const f = h.fixture(),
    item = await f.inventory();
  await f.connection.db
    .update(branches)
    .set({ verificationStatus: 'submitted' })
    .where(eq(branches.id, item.branchId));
  const queue = await h.get('/v1/admin/verifications?status=submitted', as('verification'));
  expect(
    (queue.json() as { data: { branchId: string }[] }).data.map((row) => row.branchId),
  ).toContain(item.branchId);
  const decide = (body: Record<string, unknown>, who = 'verification') =>
    h.send(`/v1/admin/verifications/${item.branchId}`, body, as(who));
  expect((await decide({ action: 'approve' }, 'moderator')).statusCode).toBe(403);
  expect((await decide({ action: 'request_changes' })).statusCode).toBe(400);
  expect((await decide({ action: 'suspend', reason: 'x' })).statusCode).toBe(409);
  expect((await decide({ action: 'start_review' })).statusCode).toBe(200);
  expect((await decide({ action: 'approve' })).statusCode).toBe(200);
  expect((await decide({ action: 'suspend', reason: 'Fake photos reported' })).statusCode).toBe(
    200,
  );
  const [row] = await f.connection.db.select().from(branches).where(eq(branches.id, item.branchId));
  expect(row?.verificationStatus).toBe('suspended');
  expect(
    (await decide({ action: 'reinstate', reason: 'Photos replaced' }, 'root')).statusCode,
  ).toBe(200);
});
it('REV-006 / ADM-008/009/010: policy moderation, support separation and announcement delivery', async () => {
  const f = h.fixture();
  const { stay, base } = await h.admitted(fullPeriod, '2026-08-25');
  const [own] = await f.connection.db.select().from(stays).where(eq(stays.id, stay.stayId));
  const reviewId = randomUUID();
  await f.connection.db.insert(reviews).values({
    id: reviewId,
    branchId: own?.branchId ?? '',
    stayId: stay.stayId,
    userId: f.customerA,
    body: 'Rude staff and spam link',
    status: 'published',
    version: 1,
  });
  await f.connection.db
    .insert(reviewRatings)
    .values(
      [
        'cleanliness',
        'security',
        'food',
        'staff',
        'wifi',
        'facilities',
        'location',
        'value',
        'overall',
      ].map((category) => ({ reviewId, category: category as 'overall', rating: 2 })),
    );
  const report = await h.ok(`/v1/reviews/${reviewId}/reports`, { reason: 'spam' }, f.ownerToken);
  const moderate = (body: Record<string, unknown>, who = 'moderator') =>
    h.send(`/v1/admin/reviews/${reviewId}/moderation`, body, as(who));
  expect(
    (await moderate({ action: 'hide', expectedVersion: 1, reason: 'Spam link' }, 'support'))
      .statusCode,
  ).toBe(403);
  expect(
    (
      await moderate({
        action: 'hide',
        expectedVersion: 1,
        reason: 'Contains a spam link',
        reportId: report.reportId,
      })
    ).statusCode,
  ).toBe(200);
  const [hidden] = await f.connection.db.select().from(reviews).where(eq(reviews.id, reviewId));
  expect(hidden).toMatchObject({ status: 'hidden', moderationReason: 'Contains a spam link' });
  expect(
    (await moderate({ action: 'restore', expectedVersion: 2, reason: 'Link removed by author' }))
      .statusCode,
  ).toBe(200);
  // Support: internal notes stay internal; a support admin is not a moderator.
  const ticket = await h.ok(
    '/v1/support/tickets',
    { subject: 'Cannot log in', category: 'account', body: 'OTP never arrives' },
    f.customerAToken,
  );
  expect((await h.get('/v1/admin/support-tickets', as('moderator'))).statusCode).toBe(403);
  await h.ok(
    `/v1/admin/support-tickets/${ticket.id}/actions`,
    { expectedVersion: 1, assignToMe: true, body: 'Checked SMTP logs', internal: true },
    as('support'),
  );
  await h.ok(
    `/v1/admin/support-tickets/${ticket.id}/actions`,
    { expectedVersion: 2, status: 'waiting_for_user', body: 'Please try again now.' },
    as('support'),
  );
  const mine = (await h.get(`/v1/support/tickets/${ticket.id}`, f.customerAToken)).json() as {
    status: string;
    messages: { body: string }[];
  };
  expect(mine.status).toBe('waiting_for_user');
  expect(mine.messages.map((row) => row.body)).toEqual([
    'OTP never arrives',
    'Please try again now.',
  ]);
  expect((await h.get(`/v1/support/tickets/${ticket.id}`, f.customerBToken)).statusCode).toBe(404);
  // ADM-010: delivered once to the live audience, even if the job runs twice.
  const sent = await h.ok(
    '/v1/admin/announcements',
    { audience: 'customers', title: 'Maintenance', body: 'App maintenance tonight 2-3 AM.' },
    as('support'),
  );
  const [job] = await f.connection.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.dedupeKey, 'announcement:' + sent.id));
  for (let run = 0; run < 2; run += 1) {
    const [leased] = await f.connection.db
      .update(notificationOutbox)
      .set({ attempts: 1, leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 600000) })
      .where(
        and(eq(notificationOutbox.id, job?.id ?? ''), eq(notificationOutbox.status, 'pending')),
      )
      .returning();
    if (leased) await deliverAnnouncement(f.connection.db, leased, h.clock);
  }
  const delivered = await f.connection.db
    .select()
    .from(notifications)
    .where(eq(notifications.type, 'platform.announcement'));
  expect(delivered.map((row) => row.userId).sort()).toEqual([f.customerA, f.customerB].sort());
  const [done] = await f.connection.db
    .select()
    .from(announcements)
    .where(eq(announcements.id, String(sent.id)));
  expect(done).toMatchObject({ status: 'sent', recipientCount: 2 });
  expect(
    (
      await h.send(
        '/v1/admin/announcements',
        { audience: 'customers', title: 'x', body: 'y' },
        as('verification'),
      )
    ).statusCode,
  ).toBe(403);
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
});
it('OWN-001..004 / MGRD / RPT-001..004: scoped dashboards, safe exports and analytics', async () => {
  const f = h.fixture();
  const { item, stay, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  await f.connection.db
    .update(residents)
    .set({ displayName: '=HYPERLINK("http://x")' })
    .where(eq(residents.userId, f.customerA));
  const dash = ownerDashboardSchema.parse(
    (await h.get('/v1/owner/dashboard?month=2026-06')).json(),
  );
  const row = dash.branches.find((value) => value.branchId === item.branchId);
  expect(row).toMatchObject({
    activeResidents: 1,
    beds: { occupied: 1 },
    rent: { invoices: 1, expectedPaisa: rent, outstandingPaisa: rent },
  });
  expect(dash.totals.activeResidents).toBe(
    dash.branches.reduce((sum, value) => sum + value.activeResidents, 0),
  );
  expect((await h.get('/v1/owner/dashboard', f.customerBToken)).statusCode).toBe(403);
  const single = ownerDashboardSchema.parse(
    (await h.get(`/v1/owner/dashboard?branchId=${item.branchId}`)).json(),
  );
  expect(single.branches).toHaveLength(1);
  expect(
    managerDashboardSchema.parse((await h.get(`/v1/branches/${item.branchId}/dashboard`)).json())
      .rent,
  ).not.toBeNull();
  const foreign = await f.inventory();
  expect((await h.get(`/v1/owner/reports/residents?branchIds=${randomUUID()}`)).statusCode).toBe(
    404,
  );
  const csv = await h.get(`/v1/owner/reports/residents?format=csv&branchIds=${item.branchId}`);
  expect(csv.headers['content-type']).toContain('text/csv');
  expect(csv.body).toContain(`"'=HYPERLINK(""http://x"")"`);
  const pdf = await h.get(
    `/v1/branches/${item.branchId}/reports/rent-collection?format=pdf&from=2026-06-01&to=2026-07-31`,
  );
  expect(pdf.rawPayload.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  const json = reportSchema.parse(
    (await h.get(`/v1/branches/${item.branchId}/reports/payment-history`)).json(),
  );
  expect(json.columns).toContain('Amount (PKR)');
  const analytics = (await h.get('/v1/owner/analytics?from=2026-06-01&to=2026-06-30')).json() as {
    coverage: unknown;
    branches: { branchId: string; bookingRequests: number; checkedIn: number }[];
  };
  expect(analytics.coverage).toEqual({ listingViews: 'not_collected', searches: 'not_collected' });
  expect(analytics.branches.find((value) => value.branchId === item.branchId)).toMatchObject({
    bookingRequests: 1,
    checkedIn: 1,
  });
  // A Manager without finance_view gets no money and no financial report; other branches refuse.
  const assignmentId = randomUUID();
  await f.connection.db.insert(managerAssignments).values({
    id: assignmentId,
    userId: f.customerB,
    branchId: item.branchId,
    status: 'active',
    appointedByUserId: f.ownerId,
    activatedAt: f.now,
  });
  await f.connection.db
    .insert(managerInventoryGrants)
    .values({ assignmentId, permission: 'stay_manage', grantedAt: f.now });
  try {
    expect(
      managerDashboardSchema.parse(
        (await h.get(`/v1/branches/${item.branchId}/dashboard`, f.customerBToken)).json(),
      ).rent,
    ).toBeNull();
    expect(
      (await h.get(`/v1/branches/${item.branchId}/reports/payment-history`, f.customerBToken))
        .statusCode,
    ).toBe(403);
    expect(
      (await h.get(`/v1/branches/${item.branchId}/reports/residents`, f.customerBToken)).statusCode,
    ).toBe(200);
    expect(
      (await h.get(`/v1/branches/${foreign.branchId}/dashboard`, f.customerBToken)).statusCode,
    ).toBe(403);
  } finally {
    await f.connection.db
      .delete(managerInventoryGrants)
      .where(eq(managerInventoryGrants.assignmentId, assignmentId));
    await f.connection.db
      .update(managerAssignments)
      .set({ status: 'deactivated' })
      .where(eq(managerAssignments.id, assignmentId));
  }
  await h.ok(base + '/checkout', {
    expectedVersion: await h.version(stay.stayId),
    reason: 'Left',
    applyAvailableDeposit: false,
  });
});
