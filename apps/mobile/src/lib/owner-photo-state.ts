import {
  accessProfileReview,
  accessProfileReviewEvidence,
  listProfileReviews,
  readOwnFileUrl,
  type ApiClient,
} from '@hsm/api-client';

// Pending moderation belongs to the identity, not an ephemeral form or device cache.
export async function readOwnerPhotoState(
  client: ApiClient,
  saved: string | null,
  reviews: boolean,
) {
  if (reviews) {
    const page = await listProfileReviews(
      client,
      'profile_photo',
      { status: 'pending', limit: 20 },
      true,
    );
    const request = page.data[0];
    if (request) {
      const input = { justification: 'View my Owner profile photo' };
      const detail = await accessProfileReview(client, 'profile_photo', request.id, input, true);
      if (detail.proposedPhotoFileId) {
        const image = await accessProfileReviewEvidence(
          client,
          'profile_photo',
          request.id,
          detail.proposedPhotoFileId,
          input,
          true,
        );
        return { uri: image.url, pending: true };
      }
    }
  }
  return { uri: saved ? (await readOwnFileUrl(client, saved)).url : undefined, pending: false };
}
