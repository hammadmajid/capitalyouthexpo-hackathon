import type { Database } from '@hsm/db';
import type { PrivateStorage } from '@hsm/files';
import type { IdempotencyService } from '../idempotency/service.js';
import { StaffPayrollService } from './staff-payroll.service.js';
import { StaffService } from './staff.service.js';
import type { StaffServices } from './staff.controller.js';
// CHG-039: staff directory and record-only salary tracking services.
export function staffServices(
  database: Database,
  idempotency: IdempotencyService,
  storage: Pick<PrivateStorage, 'presignDownload'>,
  bucket: string,
  clock: () => Date = () => new Date(),
): StaffServices {
  return {
    staff: new StaffService(database, idempotency, clock),
    payroll: new StaffPayrollService(database, idempotency, storage, bucket, clock),
  };
}
