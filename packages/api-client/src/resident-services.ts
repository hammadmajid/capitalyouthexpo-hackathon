import { z } from 'zod';
import {
  branchMenuSchema,
  complaintDetailSchema,
  complaintInputSchema,
  complaintPageSchema,
  complaintQuerySchema,
  complaintResidentActionSchema,
  complaintStaffActionSchema,
  complaintStatsSchema,
  downloadResponseSchema,
  menuUpdateInputSchema,
  ownReviewSchema,
  publicReviewPageSchema,
  reviewEditInputSchema,
  reviewEligibilitySchema,
  reviewInputSchema,
  reviewReplyInputSchema,
  reviewReportInputSchema,
  staffReviewPageSchema,
  staffReviewSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
import { bound, header, id, ownStay, withoutUndefined } from './resident-service-scope.js';
export * from './transport.js';
// SERV-001: menus (public, own Stay, staff) and the versioned whole-week replacement.
export async function readPublicMenu(client: ApiClient, branch: unknown) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.GET('/v1/public/branches/{branchId}/menu', { params: { path: { branchId } } }),
      branchMenuSchema,
    ),
    branchId,
  );
}
export async function readStayMenu(client: ApiClient, stay: unknown) {
  return readApi(
    client.GET('/v1/me/stays/{stayId}/menu', { params: { path: { stayId: id(stay) } } }),
    branchMenuSchema,
  );
}
export async function readBranchMenu(client: ApiClient, branch: unknown) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.GET('/v1/branches/{branchId}/menu', { params: { path: { branchId } } }),
      branchMenuSchema,
    ),
    branchId,
  );
}
export async function updateBranchMenu(
  client: ApiClient,
  branch: unknown,
  input: unknown,
  key: string,
) {
  const branchId = id(branch);
  // CHG-037: `times` is sent only when given; omitted keeps the current meal times.
  const { times, ...menu } = menuUpdateInputSchema.parse(input);
  return bound(
    await readApi(
      client.PUT('/v1/branches/{branchId}/menu', {
        params: { path: { branchId }, header: header(key) },
        body: times ? { ...menu, times } : menu,
      }),
      branchMenuSchema,
    ),
    branchId,
  );
}
// CMP-001..006: complaints.
function complaintQuery(query: unknown) {
  const input = complaintQuerySchema.parse(query);
  return {
    limit: input.limit,
    ...(input.status ? { status: input.status } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
  };
}
export async function createComplaint(
  client: ApiClient,
  stay: unknown,
  input: unknown,
  key: string,
) {
  const stayId = id(stay);
  return ownStay(
    await readApi(
      client.POST('/v1/me/stays/{stayId}/complaints', {
        params: { path: { stayId }, header: header(key) },
        body: complaintInputSchema.parse(input),
      }),
      complaintDetailSchema,
    ),
    stayId,
  );
}
export async function readOwnComplaints(client: ApiClient, stay: unknown, query: unknown = {}) {
  return readApi(
    client.GET('/v1/me/stays/{stayId}/complaints', {
      params: { path: { stayId: id(stay) }, query: complaintQuery(query) },
    }),
    complaintPageSchema,
  );
}
export async function readOwnComplaint(client: ApiClient, stay: unknown, complaint: unknown) {
  const stayId = id(stay);
  return ownStay(
    await readApi(
      client.GET('/v1/me/stays/{stayId}/complaints/{complaintId}', {
        params: { path: { stayId, complaintId: id(complaint) } },
      }),
      complaintDetailSchema,
    ),
    stayId,
  );
}
export async function residentComplaintAction(
  client: ApiClient,
  stay: unknown,
  complaint: unknown,
  input: unknown,
  key: string,
) {
  const stayId = id(stay);
  return ownStay(
    await readApi(
      client.POST('/v1/me/stays/{stayId}/complaints/{complaintId}/actions', {
        params: { path: { stayId, complaintId: id(complaint) }, header: header(key) },
        body: complaintResidentActionSchema.parse(input),
      }),
      complaintDetailSchema,
    ),
    stayId,
  );
}
export async function readBranchComplaints(
  client: ApiClient,
  branch: unknown,
  query: unknown = {},
) {
  return readApi(
    client.GET('/v1/branches/{branchId}/complaints', {
      params: { path: { branchId: id(branch) }, query: complaintQuery(query) },
    }),
    complaintPageSchema,
  );
}
export async function readBranchComplaint(client: ApiClient, branch: unknown, complaint: unknown) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.GET('/v1/branches/{branchId}/complaints/{complaintId}', {
        params: { path: { branchId, complaintId: id(complaint) } },
      }),
      complaintDetailSchema,
    ),
    branchId,
  );
}
export async function staffComplaintAction(
  client: ApiClient,
  branch: unknown,
  complaint: unknown,
  input: unknown,
  key: string,
) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.POST('/v1/branches/{branchId}/complaints/{complaintId}/actions', {
        params: { path: { branchId, complaintId: id(complaint) }, header: header(key) },
        body: complaintStaffActionSchema.parse(input),
      }),
      complaintDetailSchema,
    ),
    branchId,
  );
}
export async function readComplaintStats(client: ApiClient, branch: unknown) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.GET('/v1/branches/{branchId}/complaints-stats', { params: { path: { branchId } } }),
      complaintStatsSchema,
    ),
    branchId,
  );
}
export async function complaintAttachmentLink(
  client: ApiClient,
  complaint: unknown,
  file: unknown,
  scope: { stay?: unknown; branch?: unknown },
) {
  const complaintId = id(complaint),
    fileId = id(file);
  return scope.branch === undefined
    ? readApi(
        client.GET('/v1/me/stays/{stayId}/complaints/{complaintId}/attachments/{fileId}', {
          params: { path: { stayId: id(scope.stay), complaintId, fileId } },
        }),
        downloadResponseSchema,
      )
    : readApi(
        client.GET('/v1/branches/{branchId}/complaints/{complaintId}/attachments/{fileId}', {
          params: { path: { branchId: id(scope.branch), complaintId, fileId } },
        }),
        downloadResponseSchema,
      );
}
// REV-001..006: verified reviews.
const page = (query: unknown) =>
  z.object({ cursor: stayIdentifierSchema.optional() }).strict().parse(query);
export async function readReviewEligibility(client: ApiClient, stay: unknown) {
  const stayId = id(stay);
  return ownStay(
    await readApi(
      client.GET('/v1/me/stays/{stayId}/review-eligibility', { params: { path: { stayId } } }),
      reviewEligibilitySchema,
    ),
    stayId,
  );
}
export async function readOwnReview(client: ApiClient, stay: unknown) {
  const stayId = id(stay);
  return ownStay(
    await readApi(
      client.GET('/v1/me/stays/{stayId}/review', { params: { path: { stayId } } }),
      ownReviewSchema,
    ),
    stayId,
  );
}
export async function createReview(client: ApiClient, stay: unknown, input: unknown, key: string) {
  const stayId = id(stay);
  return ownStay(
    await readApi(
      client.POST('/v1/me/stays/{stayId}/review', {
        params: { path: { stayId }, header: header(key) },
        body: withoutUndefined(reviewInputSchema.parse(input)),
      }),
      ownReviewSchema,
    ),
    stayId,
  );
}
export async function editReview(client: ApiClient, stay: unknown, input: unknown, key: string) {
  const stayId = id(stay);
  return ownStay(
    await readApi(
      client.PATCH('/v1/me/stays/{stayId}/review', {
        params: { path: { stayId }, header: header(key) },
        body: withoutUndefined(reviewEditInputSchema.parse(input)),
      }),
      ownReviewSchema,
    ),
    stayId,
  );
}
export async function readPublicReviews(client: ApiClient, branch: unknown, query: unknown = {}) {
  const branchId = id(branch),
    { cursor } = page(query);
  return bound(
    await readApi(
      client.GET('/v1/public/branches/{branchId}/reviews', {
        params: { path: { branchId }, query: cursor ? { cursor } : {} },
      }),
      publicReviewPageSchema,
    ),
    branchId,
  );
}
export async function readBranchReviews(client: ApiClient, branch: unknown, query: unknown = {}) {
  const { cursor } = page(query);
  return readApi(
    client.GET('/v1/branches/{branchId}/reviews', {
      params: { path: { branchId: id(branch) }, query: cursor ? { cursor } : {} },
    }),
    staffReviewPageSchema,
  );
}
export async function replyToReview(
  client: ApiClient,
  branch: unknown,
  review: unknown,
  input: unknown,
  key: string,
) {
  const reviewId = id(review);
  const result = await readApi(
    client.PUT('/v1/branches/{branchId}/reviews/{reviewId}/reply', {
      params: { path: { branchId: id(branch), reviewId }, header: header(key) },
      body: reviewReplyInputSchema.parse(input),
    }),
    staffReviewSchema,
  );
  if (result.id !== reviewId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function reportReview(
  client: ApiClient,
  review: unknown,
  input: unknown,
  key: string,
) {
  return readApi(
    client.POST('/v1/reviews/{reviewId}/reports', {
      params: { path: { reviewId: id(review) }, header: header(key) },
      body: withoutUndefined(reviewReportInputSchema.parse(input)),
    }),
    z.object({ reportId: stayIdentifierSchema, status: z.literal('open') }).strict(),
  );
}
