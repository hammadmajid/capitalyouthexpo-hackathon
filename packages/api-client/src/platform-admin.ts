import { z } from 'zod';
import {
  adminAccountListSchema,
  adminListQuerySchema,
  adminAccountSchema,
  adminChangeInputSchema,
  adminInviteInputSchema,
  analyticsQuerySchema,
  analyticsSchema,
  announcementInputSchema,
  announcementListSchema,
  announcementSchema,
  managerDashboardSchema,
  ownerDashboardSchema,
  dashboardQuerySchema,
  reportDismissInputSchema,
  reviewModerationInputSchema,
  reviewReportQueueSchema,
  stayIdentifierSchema,
  supportQuerySchema,
  supportReplyInputSchema,
  supportStaffInputSchema,
  supportTicketInputSchema,
  supportTicketPageSchema,
  supportTicketSchema,
  verificationDecisionInputSchema,
  verificationQueueItemSchema,
  verificationQueueQuerySchema,
  verificationQueueSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = (value: unknown) => stayIdentifierSchema.parse(value);
const header = (key: string) => ({ 'Idempotency-Key': id(key) });
function withoutUndefined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
// ADM-001..006: admin hierarchy (Root-only server checks).
export function listAdmins(client: ApiClient, query: unknown = {}) {
  const input = adminListQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/admins', {
      params: { query: withoutUndefined(input) },
    }),
    adminAccountListSchema,
  );
}
export const readAdminAccount = (client: ApiClient, userId: unknown) =>
  readApi(
    client.GET('/v1/admin/admins/{userId}', {
      params: { path: { userId: id(userId) } },
    }),
    adminAccountSchema,
  );
export const readOwnAdmin = (client: ApiClient) =>
  readApi(client.GET('/v1/admin/me'), adminAccountSchema);
export const inviteAdmin = (client: ApiClient, input: unknown, key: string) =>
  readApi(
    client.POST('/v1/admin/admins', {
      params: { header: header(key) },
      body: adminInviteInputSchema.parse(input),
    }),
    adminAccountSchema,
  );
export const acceptAdminInvitation = (client: ApiClient, key: string) =>
  readApi(
    client.POST('/v1/admin/me/accept', { params: { header: header(key) } }),
    adminAccountSchema,
  );
export const changeAdmin = (client: ApiClient, user: unknown, input: unknown, key: string) =>
  readApi(
    client.POST('/v1/admin/admins/{userId}/changes', {
      params: { path: { userId: id(user) }, header: header(key) },
      body: adminChangeInputSchema.parse(input),
    }),
    adminAccountSchema,
  );
// ADM-007: verification.
export function readVerificationQueue(client: ApiClient, query: unknown = {}) {
  const input = verificationQueueQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/verifications', {
      params: {
        query: {
          status: input.status,
          limit: input.limit,
          ...(input.cursor ? { cursor: input.cursor } : {}),
        },
      },
    }),
    verificationQueueSchema,
  );
}
export const decideVerification = (
  client: ApiClient,
  branch: unknown,
  input: unknown,
  key: string,
) =>
  readApi(
    client.POST('/v1/admin/verifications/{branchId}', {
      params: { path: { branchId: id(branch) }, header: header(key) },
      body: withoutUndefined(verificationDecisionInputSchema.parse(input)),
    }),
    verificationQueueItemSchema,
  );
// ADM-008: review moderation.
export const readReviewReports = (client: ApiClient) =>
  readApi(client.GET('/v1/admin/review-reports'), reviewReportQueueSchema);
export const moderateReview = (client: ApiClient, review: unknown, input: unknown, key: string) =>
  readApi(
    client.POST('/v1/admin/reviews/{reviewId}/moderation', {
      params: { path: { reviewId: id(review) }, header: header(key) },
      body: withoutUndefined(reviewModerationInputSchema.parse(input)),
    }),
    z
      .object({
        reviewId: stayIdentifierSchema,
        status: z.enum(['published', 'hidden', 'removed']),
        version: z.number().int().positive(),
      })
      .strict(),
  );
export const dismissReviewReport = (
  client: ApiClient,
  report: unknown,
  input: unknown,
  key: string,
) =>
  readApi(
    client.POST('/v1/admin/review-reports/{reportId}/dismiss', {
      params: { path: { reportId: id(report) }, header: header(key) },
      body: reportDismissInputSchema.parse(input),
    }),
    z.object({ reportId: stayIdentifierSchema, status: z.literal('dismissed') }).strict(),
  );
// ADM-009: support.
function supportQuery(query: unknown) {
  const input = supportQuerySchema.parse(query);
  return {
    limit: input.limit,
    ...(input.status ? { status: input.status } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
  };
}
export const openSupportTicket = (client: ApiClient, input: unknown, key: string) =>
  readApi(
    client.POST('/v1/support/tickets', {
      params: { header: header(key) },
      body: supportTicketInputSchema.parse(input),
    }),
    supportTicketSchema,
  );
export const readOwnTickets = (client: ApiClient, query: unknown = {}) =>
  readApi(
    client.GET('/v1/support/tickets', { params: { query: supportQuery(query) } }),
    supportTicketPageSchema,
  );
export const readOwnTicket = (client: ApiClient, ticket: unknown) =>
  readApi(
    client.GET('/v1/support/tickets/{ticketId}', { params: { path: { ticketId: id(ticket) } } }),
    supportTicketSchema,
  );
export const replyOwnTicket = (client: ApiClient, ticket: unknown, input: unknown, key: string) =>
  readApi(
    client.POST('/v1/support/tickets/{ticketId}/replies', {
      params: { path: { ticketId: id(ticket) }, header: header(key) },
      body: supportReplyInputSchema.parse(input),
    }),
    supportTicketSchema,
  );
export const readSupportQueue = (client: ApiClient, query: unknown = {}) =>
  readApi(
    client.GET('/v1/admin/support-tickets', { params: { query: supportQuery(query) } }),
    supportTicketPageSchema,
  );
export const readSupportTicket = (client: ApiClient, ticket: unknown) =>
  readApi(
    client.GET('/v1/admin/support-tickets/{ticketId}', {
      params: { path: { ticketId: id(ticket) } },
    }),
    supportTicketSchema,
  );
export const actOnSupportTicket = (
  client: ApiClient,
  ticket: unknown,
  input: unknown,
  key: string,
) =>
  readApi(
    client.POST('/v1/admin/support-tickets/{ticketId}/actions', {
      params: { path: { ticketId: id(ticket) }, header: header(key) },
      body: withoutUndefined(supportStaffInputSchema.parse(input)),
    }),
    supportTicketSchema,
  );
// ADM-010: announcements.
export const readAnnouncements = (client: ApiClient) =>
  readApi(client.GET('/v1/admin/announcements'), announcementListSchema);
export const createAnnouncement = (client: ApiClient, input: unknown, key: string) =>
  readApi(
    client.POST('/v1/admin/announcements', {
      params: { header: header(key) },
      body: withoutUndefined(announcementInputSchema.parse(input)),
    }),
    announcementSchema,
  );
export const cancelAnnouncement = (client: ApiClient, announcement: unknown, key: string) =>
  readApi(
    client.POST('/v1/admin/announcements/{announcementId}/cancel', {
      params: { path: { announcementId: id(announcement) }, header: header(key) },
    }),
    announcementSchema,
  );
// OWN / MGRD / RPT: dashboards, analytics and reports.
export async function readOwnerDashboard(
  client: ApiClient,
  query: { branchId?: string; month?: string; cursor?: string; limit?: number } = {},
) {
  const input = dashboardQuerySchema.parse(query);
  const page = await readApi(
    client.GET('/v1/owner/dashboard', {
      params: {
        query: withoutUndefined({
          branchId: input.branchId,
          month: input.month,
          cursor: input.cursor,
          limit: query.limit === undefined ? undefined : input.limit,
        }),
      },
    }),
    ownerDashboardSchema,
  );
  if (
    page.branches.length > input.limit ||
    new Set(page.branches.map((row) => row.branchId)).size !== page.branches.length ||
    (input.branchId && page.branches.some((row) => row.branchId !== input.branchId)) ||
    (input.cursor && page.branches.some((row) => row.branchId === input.cursor)) ||
    (page.nextCursor !== null &&
      (input.branchId !== undefined ||
        page.branches.length !== input.limit ||
        page.nextCursor !== page.branches.at(-1)?.branchId))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
export const readBranchDashboard = (client: ApiClient, branch: unknown) =>
  readApi(
    client.GET('/v1/branches/{branchId}/dashboard', { params: { path: { branchId: id(branch) } } }),
    managerDashboardSchema,
  );
export function readOwnerAnalytics(client: ApiClient, query: unknown) {
  const input = analyticsQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/owner/analytics', { params: { query: { from: input.from, to: input.to } } }),
    analyticsSchema,
  );
}
export { readReport, reportDownloadPath, readReportFilterOptions } from './reports.js';
export type { ReportClientQuery } from './reports.js';
