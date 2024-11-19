import { contactPhoneE164 } from './phone.js';
import { z } from 'zod';
import { branchSummarySchema } from './management.js';
export const hostelCategorySchema = z.enum(['boys', 'girls', 'working_male', 'working_female']);
export const hostelPropertyTierSchema = z.enum(['standard', 'premium', 'luxury']);
const yearFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
});
export const hostelEstablishmentYearSchema = z
  .number()
  .int()
  .min(1800)
  .max(9999)
  .refine(
    (year) => year <= Number(yearFormatter.format(new Date())),
    'Establishment year cannot be in the future',
  );
const optionalMetadata = {
  propertyTier: hostelPropertyTierSchema.nullable().optional(),
  establishmentYear: hostelEstablishmentYearSchema.nullable().optional(),
};
const name = z.string().trim().min(2).max(150);
const description = z.string().trim().max(5000).nullable().optional();
const contactPhone = z
  .string()
  .trim()
  .min(7)
  .max(30)
  .regex(/^\+?[\d ()-]+$/)
  .refine((value) => {
    const digits = value.replace(/\D/g, '').length;
    return digits >= 7 && digits <= 15;
  }, 'Contact phone must contain seven to fifteen digits')
  // TRUST-006: saved in the listing's international form so the listing can read it back.
  .refine((value) => contactPhoneE164(value) !== null, 'Enter a full phone number')
  .transform((value) => contactPhoneE164(value) ?? value);
const phone = contactPhone.nullable().optional();
export const hostelBasicsInputSchema = z
  .object({
    name,
    ...optionalMetadata,
    category: hostelCategorySchema.nullable().optional(),
    description,
    phone,
    logoFileId: z.string().uuid().nullable().optional(),
    showPublicContact: z.boolean().optional(),
  })
  .strict();
export const branchLocationSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
export const mainBranchDraftInputSchema = z
  .object({
    name,
    ...optionalMetadata,
    category: hostelCategorySchema.nullable().optional(),
    description,
    phone,
    cityId: z.string().uuid().nullable().optional(),
    areaId: z.string().uuid().nullable().optional(),
    subAreaId: z.string().uuid().nullable().optional(),
    addressLine: z.string().trim().min(5).max(500).nullable().optional(),
    location: branchLocationSchema.nullable().optional(),
    nearbyLandmark: z.string().trim().max(200).nullable().optional(),
    showPublicContact: z.boolean().optional(),
  })
  .strict();
export const mainBranchDraftSchema = z
  .object({
    id: z.string().uuid(),
    name,
    ...optionalMetadata,
    // BRN-001: additional branches reuse the same setup draft; only one live primary per brand.
    isPrimary: z.boolean(),
    category: hostelCategorySchema.nullable(),
    cityId: z.string().uuid().nullable(),
    areaId: z.string().uuid().nullable(),
    subAreaId: z.string().uuid().nullable(),
    addressLine: z.string().nullable(),
    location: branchLocationSchema.nullable(),
    nearbyLandmark: z.string().nullable(),
    description: z.string().nullable(),
    phone: z.string().nullable(),
    showPublicContact: z.boolean(),
    verificationStatus: branchSummarySchema.shape.verificationStatus,
  })
  .strict();
export const hostelOnboardingSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    name,
    logoFileId: z.string().uuid().nullable(),
    // On /branches/:branchId routes this carries the selected additional branch.
    mainBranch: mainBranchDraftSchema.nullable(),
    missingFields: z
      .array(z.enum(['main_branch', 'category', 'city', 'area', 'address', 'location']))
      .max(6),
    // OWN-001 / ADM-007: the latest platform reason, only while changes are requested or the
    // hostel was not approved, so the Owner knows what to fix. Absent otherwise.
    verificationNote: z.string().min(1).max(1000).nullable().optional(),
  })
  .strict();
export type HostelBasicsInput = z.infer<typeof hostelBasicsInputSchema>;
export type MainBranchDraftInput = z.infer<typeof mainBranchDraftInputSchema>;
export type MainBranchDraft = z.infer<typeof mainBranchDraftSchema>;
export type HostelOnboarding = z.infer<typeof hostelOnboardingSchema>;

// Replay persistence excludes arbitrary entered text, contact details and signed URLs.
export const hostelOnboardingStateSchema = hostelOnboardingSchema
  .pick({
    id: true,
    organizationId: true,
    missingFields: true,
  })
  .extend({
    mainBranchId: z.string().uuid().nullable(),
    verificationStatus: branchSummarySchema.shape.verificationStatus.nullable(),
  })
  .strict();
export const hostelSummarySchema = hostelOnboardingSchema
  .pick({
    id: true,
    organizationId: true,
    name: true,
    logoFileId: true,
  })
  .strict();
export const hostelPageSchema = z
  .object({
    data: z.array(hostelSummarySchema).max(100),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();
export type HostelOnboardingState = z.infer<typeof hostelOnboardingStateSchema>;
