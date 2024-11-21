import { flagCurrentProfilePhoto, listProfilePhotoSubjects } from './profile-photo-cases.js';
import { sql } from 'drizzle-orm';
import type { Database } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { ProfileReviewReadService } from './profile-review-read.service.js';
import { submitProfileReview } from './profile-review-submissions.js';
import { decideProfileReview } from './profile-review-decisions.js';
import type { ProfileReviewContext, ReviewKind } from './profile-review-context.js';
import type { VerificationStorage } from './verification-evidence.js';
export class ProfileReviewService {
  readonly read: ProfileReviewReadService;
  constructor(
    private readonly context: ProfileReviewContext,
    storage?: VerificationStorage,
  ) {
    this.read = new ProfileReviewReadService(context, storage);
  }
  submit(actor: Actor, key: unknown, kind: ReviewKind, body: unknown) {
    return submitProfileReview(this.context, actor, key, kind, body);
  }
  decide(actor: Actor, key: unknown, id: unknown, kind: ReviewKind, body: unknown) {
    return decideProfileReview(this.context, actor, key, id, kind, body);
  }
  cancel(actor: Actor, key: unknown, id: unknown, kind: ReviewKind, body: unknown) {
    return decideProfileReview(this.context, actor, key, id, kind, body, true);
  }
  photoSubjects(actor: Actor, query: unknown) {
    return listProfilePhotoSubjects(this.context, actor, query);
  }
  flagPhoto(actor: Actor, key: unknown, userId: unknown, body: unknown) {
    return flagCurrentProfilePhoto(this.context, actor, key, userId, body);
  }
}
// Explicit rollout gate. Read-only check; this never creates or migrates tables.
export async function assertProfileReviewSchema(database: Database) {
  const rows = await database.execute(sql`select count(*)::int as count from pg_trigger
    where not tgisinternal and tgenabled <> 'D' and tgname in ('profile_review_decisions_immutable','profile_review_evidence_immutable',
      'profile_review_requests_no_delete','profile_review_request_transition','profile_review_evidence_guard',
      'profile_review_decision_guard','profile_review_requires_decision')`);
  if (rows[0]?.count !== 7)
    throw new DomainError(
      'INTERNAL',
      503,
      'Profile review rollout requires its approved migration and immutable history guards',
    );
}
