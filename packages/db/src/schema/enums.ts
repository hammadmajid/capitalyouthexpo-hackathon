import { pgEnum } from 'drizzle-orm/pg-core';
export const gender = pgEnum('gender_enum', ['male', 'female']);
export const accountStatus = pgEnum('account_status_enum', [
  'unclaimed',
  'active',
  'suspended',
  'banned',
  'deactivated',
]);
export const client = pgEnum('client_enum', ['mobile', 'web']);
export const otpPurpose = pgEnum('otp_purpose_enum', [
  'signup_verify',
  'password_reset',
  'email_change',
  'walk_in_claim',
]);
export const managerStatus = pgEnum('manager_status_enum', [
  'pending_activation',
  'active',
  'suspended',
  'deactivated',
]);
export const adminStatus = pgEnum('admin_status_enum', [
  'invited',
  'active',
  'suspended',
  'deactivated',
]);
export const adminRole = pgEnum('admin_role_enum', [
  'verification',
  'support',
  'content_moderator',
  'billing',
]);
export const hostelCategory = pgEnum('hostel_category_enum', [
  'boys',
  'girls',
  'working_male',
  'working_female',
]);
export const propertyTier = pgEnum('property_tier_enum', ['standard', 'premium', 'luxury']);
export const verificationStatus = pgEnum('verification_status_enum', [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
  'suspended',
]);
export const planStatus = pgEnum('plan_status_enum', ['free']);
export const upfront = pgEnum('upfront_enum', [
  'none',
  'deposit',
  'first_rent',
  'deposit_and_first_rent',
]);
export const lateFeeType = pgEnum('late_fee_type_enum', [
  'disabled',
  'fixed',
  'percentage',
  'manual',
]);
export const areaLevel = pgEnum('area_level_enum', ['zone', 'area', 'sector', 'sub_area']);
// CHG-033: places cover every searchable point: campuses, schools, health, hotels, food, offices,
// government, businesses, libraries and localities such as G-10.
export const placeType = pgEnum('place_type_enum', [
  'university',
  'office',
  'business_hub',
  'school',
  'health',
  'hotel',
  'food',
  'government',
  'library',
  'locality',
]);
export const visibility = pgEnum('file_visibility_enum', ['public', 'private']);
export const filePurpose = pgEnum('file_purpose_enum', [
  'listing_photo',
  'payment_proof',
  'resident_document',
  'agreement_template',
  'stay_agreement',
  'verification_document',
  'chat_attachment',
  'complaint_attachment',
  'receipt_pdf',
  'export',
  'avatar',
  'import',
  // CHG-039: private scanned staff agreements.
  'staff_agreement',
]);
export const scanStatus = pgEnum('scan_status_enum', ['pending', 'clean', 'rejected']);
export const channel = pgEnum('notification_channel_enum', [
  'in_app',
  'email',
  'push',
  'sms',
  'internal',
]);
export const deliveryStatus = pgEnum('delivery_status_enum', ['pending', 'sent', 'failed', 'dead']);
