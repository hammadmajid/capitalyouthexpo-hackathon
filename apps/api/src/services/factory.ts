import type { Database } from '@hsm/db';
import type { PrivateStorage } from '@hsm/files';
import type { IdempotencyService } from '../idempotency/service.js';
import { MenuService } from './menu.service.js';
import { TransportRouteService } from './transport-routes.service.js';
import { TransportSubscriptionService } from './transport-subscriptions.service.js';
import { ComplaintService } from './complaints.service.js';
import { ReviewService } from './reviews.service.js';
import type { ResidentServices } from './services.controller.js';
import type { ResidentFeedback } from './feedback.controller.js';
// Phase 9 production wiring shared by main, the OpenAPI generator and integration fixtures.
export function residentServices(
  database: Database,
  idempotency: IdempotencyService,
  clock: () => Date = () => new Date(),
): ResidentServices {
  return {
    menu: new MenuService(database, idempotency, clock),
    routes: new TransportRouteService(database, idempotency, clock),
    subscriptions: new TransportSubscriptionService(database, idempotency, clock),
  };
}
export function residentFeedback(
  database: Database,
  idempotency: IdempotencyService,
  storage: Pick<PrivateStorage, 'presignDownload'>,
  bucket: string,
  clock: () => Date = () => new Date(),
): ResidentFeedback {
  return {
    complaints: new ComplaintService(database, idempotency, storage, bucket, clock),
    reviews: new ReviewService(database, idempotency, clock),
  };
}
