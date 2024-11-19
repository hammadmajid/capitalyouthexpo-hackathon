import { z } from 'zod';
import {
  downloadResponseSchema,
  identityCorrectionDecisionSchema,
  identityCorrectionInputSchema,
  profilePhotoDecisionSchema,
  profilePhotoSubmissionSchema,
  profilePhotoSubjectPageSchema,
  profileReviewAccessSchema,
  profileReviewCancelSchema,
  profileReviewDetailSchema,
  profileReviewHistoryPageSchema,
  profileReviewHistoryQuerySchema,
  profileReviewMetadataSchema,
  profileReviewPageSchema,
  profileReviewQuerySchema,
  stayIdentifierSchema as id,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const kindSchema = z.enum(['identity', 'profile_photo']);
export type ProfileReviewKind = z.infer<typeof kindSchema>;
function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
export function listProfileReviews(
  client: ApiClient,
  kind: ProfileReviewKind,
  query: unknown = {},
  own = false,
) {
  return readApi(
    client.GET(own ? '/v1/me/profile-reviews/{kind}' : '/v1/admin/profile-reviews/{kind}', {
      params: {
        path: { kind: kindSchema.parse(kind) },
        query: defined(profileReviewQuerySchema.parse(query)),
      },
    }),
    profileReviewPageSchema,
  );
}
export async function accessProfileReview(
  client: ApiClient,
  kind: ProfileReviewKind,
  requestId: unknown,
  input: unknown,
  own = false,
) {
  const target = id.parse(requestId);
  const result = await readApi(
    client.POST(
      own
        ? '/v1/me/profile-reviews/{kind}/{requestId}/access'
        : '/v1/admin/profile-reviews/{kind}/{requestId}/access',
      {
        params: { path: { kind: kindSchema.parse(kind), requestId: target } },
        body: profileReviewAccessSchema.parse(input),
      },
    ),
    profileReviewDetailSchema,
  );
  if (result.review.id !== target || result.review.kind !== kind)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export function accessProfileReviewEvidence(
  client: ApiClient,
  kind: ProfileReviewKind,
  requestId: unknown,
  fileId: unknown,
  input: unknown,
  own = false,
) {
  return readApi(
    client.POST(
      own
        ? '/v1/me/profile-reviews/{kind}/{requestId}/files/{fileId}/access'
        : '/v1/admin/profile-reviews/{kind}/{requestId}/files/{fileId}/access',
      {
        params: {
          path: {
            kind: kindSchema.parse(kind),
            requestId: id.parse(requestId),
            fileId: id.parse(fileId),
          },
        },
        body: profileReviewAccessSchema.parse(input),
      },
    ),
    downloadResponseSchema,
  );
}
export function readProfileReviewHistory(
  client: ApiClient,
  kind: ProfileReviewKind,
  requestId: unknown,
  query: unknown = {},
  own = false,
) {
  return readApi(
    client.GET(
      own
        ? '/v1/me/profile-reviews/{kind}/{requestId}/history'
        : '/v1/admin/profile-reviews/{kind}/{requestId}/history',
      {
        params: {
          path: { kind: kindSchema.parse(kind), requestId: id.parse(requestId) },
          query: defined(profileReviewHistoryQuerySchema.parse(query)),
        },
      },
    ),
    profileReviewHistoryPageSchema,
  );
}
export async function submitProfileReview(
  client: ApiClient,
  kind: ProfileReviewKind,
  input: unknown,
  key: unknown,
) {
  const result = await readApi(
    client.POST('/v1/me/profile-reviews/{kind}', {
      params: {
        path: { kind: kindSchema.parse(kind) },
        header: { 'Idempotency-Key': id.parse(key) },
      },
      body:
        kind === 'identity'
          ? identityCorrectionInputSchema.parse(input)
          : profilePhotoSubmissionSchema.parse(input),
    }),
    profileReviewMetadataSchema,
  );
  if (result.kind !== kind || result.status !== 'pending')
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function decideProfileReview(
  client: ApiClient,
  kind: ProfileReviewKind,
  requestId: unknown,
  input: unknown,
  key: unknown,
  cancel = false,
) {
  const target = id.parse(requestId),
    path = { kind: kindSchema.parse(kind), requestId: target },
    header = { 'Idempotency-Key': id.parse(key) };
  const result = await readApi(
    cancel
      ? client.POST('/v1/me/profile-reviews/{kind}/{requestId}/cancel', {
          params: { path, header },
          body: profileReviewCancelSchema.parse(input),
        })
      : client.POST('/v1/admin/profile-reviews/{kind}/{requestId}/decisions', {
          params: { path, header },
          body:
            kind === 'identity'
              ? identityCorrectionDecisionSchema.parse(input)
              : profilePhotoDecisionSchema.parse(input),
        }),
    profileReviewMetadataSchema,
  );
  if (result.id !== target || result.kind !== kind) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export function listProfilePhotoSubjects(client: ApiClient, query: unknown = {}) {
  const { cursor, limit } = profileReviewQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/admin/profile-reviews/profile_photo/subjects', {
      params: { query: { limit, ...(cursor ? { cursor } : {}) } },
    }),
    profilePhotoSubjectPageSchema,
  );
}
export function flagProfilePhoto(client: ApiClient, userId: unknown, input: unknown, key: unknown) {
  return readApi(
    client.POST('/v1/admin/profile-reviews/profile_photo/subjects/{userId}/flag', {
      params: { path: { userId: id.parse(userId) }, header: { 'Idempotency-Key': id.parse(key) } },
      body: profilePhotoSubmissionSchema.parse(input),
    }),
    profileReviewMetadataSchema,
  );
}
