import {
  HOSTEL_REVISION_SERVICE,
  HostelRevisionController,
} from './management/hostel-revision.controller.js';
import {
  HOSTEL_REVISION_REVIEW,
  HostelRevisionReviewController,
} from './admin/hostel-revision.controller.js';
import type { HostelRevisionServices } from './management/hostel-revision.factory.js';
import { STAFF_SERVICES, StaffController, type StaffServices } from './staff/staff.controller.js';
import { AdminExplorerController, ADMIN_EXPLORER } from './admin/explorer.controller.js';
import type { AdminExplorerService } from './admin/explorer.service.js';
import { ProfileReviewController, PROFILE_REVIEWS } from './admin/profile-review.controller.js';
import { OwnProfileReviewController } from './admin/own-profile-review.controller.js';
import type { ProfileReviewService } from './admin/profile-review.service.js';
import {
  CustomerGovernanceController,
  CUSTOMER_GOVERNANCE,
} from './admin/customer-governance.controller.js';
import type { CustomerGovernanceService } from './admin/customer-governance.service.js';
import {
  PlatformAdminController,
  PLATFORM_ADMIN,
  type PlatformAdmin,
} from './admin/admin.controller.js';
import { InsightsController, INSIGHTS, type Insights } from './insights/insights.controller.js';
import { SupportPagesController } from './admin/support-pages.controller.js';
import { VerificationReadController, VERIFICATION_READ } from './admin/verification.controller.js';
import type { VerificationReadService } from './admin/verification-read.service.js';
import { ModerationReadController, MODERATION_READ } from './admin/moderation-read.controller.js';
import type { ModerationReadService } from './admin/moderation-read.service.js';
import {
  AdminReferenceReadController,
  ADMIN_REFERENCE,
} from './admin/reference-read.controller.js';
import type { AdminReferenceReadService } from './admin/reference-read.service.js';
import {
  PlatformInsightsController,
  PLATFORM_INSIGHTS,
} from './admin/platform-insights.controller.js';
import type { PlatformInsightsService } from './admin/platform-insights.service.js';
import {
  ResidentServicesController,
  RESIDENT_SERVICES,
  type ResidentServices,
} from './services/services.controller.js';
import {
  ResidentFeedbackController,
  RESIDENT_FEEDBACK,
  type ResidentFeedback,
} from './services/feedback.controller.js';
// Phase 9 resident services and Phase 10 platform modules, registered only when supplied.
export type PhaseNineTenServices = {
  adminExplorer?: AdminExplorerService;
  profileReviews?: ProfileReviewService;
  residentServices?: ResidentServices;
  residentFeedback?: ResidentFeedback;
  platformAdmin?: PlatformAdmin;
  insights?: Insights;
  verificationRead?: VerificationReadService;
  moderationRead?: ModerationReadService;
  adminReference?: AdminReferenceReadService;
  platformInsights?: PlatformInsightsService;
  customerGovernance?: CustomerGovernanceService;
  staff?: StaffServices;
  hostelRevisions?: HostelRevisionServices;
};
export function phaseNineTenControllers(services?: PhaseNineTenServices) {
  return [
    ...(services?.adminExplorer ? [AdminExplorerController] : []),
    ...(services?.profileReviews ? [ProfileReviewController, OwnProfileReviewController] : []),
    ...(services?.customerGovernance ? [CustomerGovernanceController] : []),
    ...(services?.residentServices ? [ResidentServicesController] : []),
    ...(services?.residentFeedback ? [ResidentFeedbackController] : []),
    ...(services?.platformAdmin ? [PlatformAdminController, SupportPagesController] : []),
    ...(services?.verificationRead ? [VerificationReadController] : []),
    ...(services?.moderationRead ? [ModerationReadController] : []),
    ...(services?.adminReference ? [AdminReferenceReadController] : []),
    ...(services?.platformInsights ? [PlatformInsightsController] : []),
    ...(services?.insights ? [InsightsController] : []),
    ...(services?.staff ? [StaffController] : []),
    ...(services?.hostelRevisions
      ? [HostelRevisionController, HostelRevisionReviewController]
      : []),
  ];
}
export function phaseNineTenProviders(services?: PhaseNineTenServices) {
  return [
    { provide: ADMIN_EXPLORER, useValue: services?.adminExplorer },
    { provide: PROFILE_REVIEWS, useValue: services?.profileReviews },
    { provide: CUSTOMER_GOVERNANCE, useValue: services?.customerGovernance },
    { provide: RESIDENT_SERVICES, useValue: services?.residentServices },
    { provide: RESIDENT_FEEDBACK, useValue: services?.residentFeedback },
    { provide: PLATFORM_ADMIN, useValue: services?.platformAdmin },
    { provide: INSIGHTS, useValue: services?.insights },
    { provide: VERIFICATION_READ, useValue: services?.verificationRead },
    { provide: MODERATION_READ, useValue: services?.moderationRead },
    { provide: ADMIN_REFERENCE, useValue: services?.adminReference },
    { provide: PLATFORM_INSIGHTS, useValue: services?.platformInsights },
    { provide: STAFF_SERVICES, useValue: services?.staff },
    { provide: HOSTEL_REVISION_SERVICE, useValue: services?.hostelRevisions?.owner },
    { provide: HOSTEL_REVISION_REVIEW, useValue: services?.hostelRevisions?.review },
  ];
}
