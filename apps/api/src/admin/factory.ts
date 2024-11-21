import { AdminExplorerService } from './explorer.service.js';
import { CustomerGovernanceService } from './customer-governance.service.js';
import type { Database } from '@hsm/db';
import type { IdempotencyService } from '../idempotency/service.js';
import { AdminAccountService } from './admins.service.js';
import { GovernanceService } from './governance.service.js';
import { SupportService } from './support.service.js';
import { DashboardService } from '../insights/dashboard.service.js';
import { ReportService } from '../insights/reports.service.js';
import type { PlatformAdmin } from './admin.controller.js';
import type { Insights } from '../insights/insights.controller.js';
import { VerificationReadService } from './verification-read.service.js';
import type { VerificationStorage } from './verification-evidence.js';
import { ModerationReadService } from './moderation-read.service.js';
import { AdminReferenceReadService } from './reference-read.service.js';
import { PlatformInsightsService } from './platform-insights.service.js';
// Phase 10 production wiring shared by main, the OpenAPI generator and integration fixtures.
export function platformAdmin(
  database: Database,
  idempotency: IdempotencyService,
  clock: () => Date = () => new Date(),
): PlatformAdmin {
  return {
    admins: new AdminAccountService(database, idempotency, clock),
    governance: new GovernanceService(database, idempotency, clock),
    support: new SupportService(database, idempotency, clock),
  };
}
export function insights(database: Database, clock: () => Date = () => new Date()): Insights {
  return {
    dashboards: new DashboardService(database, clock),
    reports: new ReportService(database, clock),
  };
}
export function platformAdminReaders(
  database: Database,
  storage?: VerificationStorage,
  clock: () => Date = () => new Date(),
  idempotency?: IdempotencyService,
) {
  return {
    ...(idempotency
      ? { customerGovernance: new CustomerGovernanceService(database, idempotency, clock) }
      : {}),
    adminExplorer: new AdminExplorerService(database, clock),
    verificationRead: new VerificationReadService(database, storage, clock),
    moderationRead: new ModerationReadService(database, clock),
    adminReference: new AdminReferenceReadService(database, clock),
    platformInsights: new PlatformInsightsService(database, clock),
  };
}
