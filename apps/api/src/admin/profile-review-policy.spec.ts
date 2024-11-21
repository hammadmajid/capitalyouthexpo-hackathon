import { expect, it } from 'vitest';
import {
  authorizeProfileReview,
  nextProfileReviewState,
  requireProfileReviewFile,
} from './profile-review-policy.js';
const root = {
  kind: 'identity' as const,
  actorId: 'root',
  subjectId: 'subject',
  subjectAdminLinked: false,
  isRoot: true,
  roles: [],
};
it('HMA-015 SEC-003: identity review rejects non-Root, self and every Admin-linked subject', () => {
  for (const roles of [[], ['support'], ['verification'], ['content_moderator']])
    expect(() => authorizeProfileReview({ ...root, isRoot: false, roles })).toThrow();
  expect(() => authorizeProfileReview({ ...root, subjectId: 'root' })).toThrow();
  expect(() => authorizeProfileReview({ ...root, subjectAdminLinked: true })).toThrow();
  expect(() => authorizeProfileReview(root)).not.toThrow();
});
it('HMA-015: photo review allows only moderation authority and preserves terminal decisions', () => {
  expect(() =>
    authorizeProfileReview({
      ...root,
      kind: 'profile_photo',
      isRoot: false,
      roles: ['content_moderator'],
    }),
  ).not.toThrow();
  expect(() =>
    authorizeProfileReview({ ...root, kind: 'profile_photo', isRoot: false, roles: ['support'] }),
  ).toThrow();
  expect(nextProfileReviewState('identity', 'pending', 'approve', 1, 1)).toBe('approved');
  expect(nextProfileReviewState('profile_photo', 'approved', 'withdraw', 2, 2)).toBe('withdrawn');
  expect(() => nextProfileReviewState('identity', 'approved', 'withdraw', 2, 2)).toThrow();
  expect(() => nextProfileReviewState('identity', 'pending', 'approve', 2, 1)).toThrow();
  expect(() => nextProfileReviewState('profile_photo', 'withdrawn', 'approve', 3, 3)).toThrow();
});
it('HMA-015 SEC-003: evidence requires exact uploader, purpose, private bucket/key and clean digest', () => {
  const file = {
    id: 'file',
    mimeType: 'image/png',
    uploadedBy: 'subject',
    bucket: 'private-bucket',
    objectKey: 'private/avatar/file/clean',
    visibility: 'private' as const,
    purpose: 'avatar' as const,
    scanStatus: 'clean' as const,
    sha256: Buffer.alloc(32, 1),
  };
  expect(requireProfileReviewFile(file, 'subject', 'private-bucket', 'avatar')).toBe(file);
  for (const patch of [
    { uploadedBy: 'foreign' },
    { bucket: 'foreign' },
    { visibility: 'public' as const },
    { purpose: 'verification_document' as const },
    { scanStatus: 'pending' as const },
    { sha256: Buffer.alloc(31) },
    { objectKey: 'quarantine/avatar/file' },
  ])
    expect(() =>
      requireProfileReviewFile({ ...file, ...patch }, 'subject', 'private-bucket', 'avatar'),
    ).toThrow();
});
