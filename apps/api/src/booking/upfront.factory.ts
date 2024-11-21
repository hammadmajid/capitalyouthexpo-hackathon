import type { Database } from '@hsm/db';
import type { PrivateStorage } from '@hsm/files';
import type { IdempotencyService } from '../idempotency/service.js';
import { AuditWriter } from '../audit/writer.js';
import { BookingActionRepository } from './actions.repository.js';
import { BookingUpfrontRepository } from './upfront.repository.js';
import { PaymentInstructionRepository } from './payment-instructions.repository.js';
import { BookingUpfrontService } from './upfront.service.js';
import { UpfrontSettingsRepository } from './upfront-settings.repository.js';
// One composition for runtime and tests keeps the confirmation repository shared.
export function bookingUpfrontService(
  database: Database,
  bucket: string,
  storage: Pick<PrivateStorage, 'presignDownload'>,
  idempotency: IdempotencyService,
  clock: () => Date = () => new Date(),
) {
  const audit = new AuditWriter(),
    actions = new BookingActionRepository(database, audit, clock, bucket);
  return new BookingUpfrontService(
    database,
    actions,
    new BookingUpfrontRepository(actions, bucket, audit, clock),
    new PaymentInstructionRepository(database, audit, clock),
    idempotency,
    storage,
    new UpfrontSettingsRepository(database, audit, clock),
    clock,
  );
}
