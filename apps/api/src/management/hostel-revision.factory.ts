import type { Database } from '@hsm/db';
import type { IdempotencyService } from '../idempotency/service.js';
import { HostelRevisionReviewService } from '../admin/hostel-revision-review.service.js';
import { HostelSetupRepository } from './hostel-setup.repository.js';
import { HostelRevisionRepository } from './hostel-revision.repository.js';
import { HostelRevisionService } from './hostel-revision.service.js';
export type HostelRevisionServices = {
  owner: HostelRevisionService;
  review: HostelRevisionReviewService;
};
// CHG-041: Owner edits to an approved hostel and their Admin review.
export function hostelRevisionServices(
  database: Database,
  idempotency: IdempotencyService,
  bucket: string,
): HostelRevisionServices {
  return {
    owner: new HostelRevisionService(
      new HostelRevisionRepository(database, bucket),
      new HostelSetupRepository(database, bucket, undefined),
      idempotency,
    ),
    review: new HostelRevisionReviewService(database, idempotency),
  };
}
