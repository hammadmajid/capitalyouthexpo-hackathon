import {
  DomainError,
  mainBranchDraftSchema,
  hostelOnboardingStateSchema,
  type HostelBasicsInput,
  type HostelOnboarding,
  type MainBranchDraft,
  type MainBranchDraftInput,
} from '@hsm/contracts';
export function requireEditableDraft(branch: MainBranchDraft | null) {
  if (branch && !['draft', 'changes_requested', 'rejected'].includes(branch.verificationStatus))
    throw new DomainError('CONFLICT', 409, 'Hostel setup is not editable');
}
export function missingSetupFields(
  branch: MainBranchDraft | null,
): HostelOnboarding['missingFields'] {
  if (!branch) return ['main_branch'];
  const missing: HostelOnboarding['missingFields'] = [];
  if (!branch.category) missing.push('category');
  if (!branch.cityId) missing.push('city');
  if (!branch.areaId) missing.push('area');
  if (!branch.addressLine?.trim()) missing.push('address');
  if (!branch.location) missing.push('location');
  return missing;
}
export function requireSubmission(
  branch: MainBranchDraft | null,
): asserts branch is MainBranchDraft {
  requireEditableDraft(branch);
  if (missingSetupFields(branch).length)
    throw new DomainError('CONFLICT', 409, 'Complete main branch setup before submission');
}
export function setupState(hostel: HostelOnboarding) {
  return hostelOnboardingStateSchema.parse({
    id: hostel.id,
    organizationId: hostel.organizationId,
    mainBranchId: hostel.mainBranch?.id ?? null,
    verificationStatus: hostel.mainBranch?.verificationStatus ?? null,
    missingFields: missingSetupFields(hostel.mainBranch),
  });
}
export function newMainBranch(id: string, input: HostelBasicsInput): MainBranchDraft {
  return mainBranchDraftSchema.parse({
    id,
    name: 'Main branch',
    isPrimary: true,
    category: input.category ?? null,
    propertyTier: input.propertyTier ?? null,
    establishmentYear: input.establishmentYear ?? null,
    cityId: null,
    areaId: null,
    subAreaId: null,
    addressLine: null,
    location: null,
    nearbyLandmark: null,
    description: input.description ?? null,
    phone: input.phone ?? null,
    showPublicContact: input.showPublicContact ?? false,
    verificationStatus: 'draft',
  });
}
// BRN-001: one main branch per hostel; more branches only after it was submitted at least once.
function requireMainBranchForAdditional(
  primary: MainBranchDraft | null,
): asserts primary is MainBranchDraft {
  if (!primary || primary.verificationStatus === 'draft')
    throw new DomainError('CONFLICT', 409, 'Submit the main branch before adding branches');
}
// BRN-001: an additional branch starts as a private draft that copies the primary branch's
// basics (type, tier, description, contact) but never its address, pin or approval state.
export function newAdditionalBranch(
  id: string,
  primary: MainBranchDraft | null,
  input: MainBranchDraftInput,
): MainBranchDraft {
  requireMainBranchForAdditional(primary);
  return mainBranchDraftSchema.parse({
    ...newMainBranch(id, {
      name: input.name,
      category: primary.category,
      propertyTier: primary.propertyTier ?? null,
      establishmentYear: primary.establishmentYear ?? null,
      description: primary.description,
      phone: primary.phone,
      showPublicContact: primary.showPublicContact,
    }),
    ...input,
    isPrimary: false,
  });
}
export function applyMainDraft(branch: MainBranchDraft, input: MainBranchDraftInput) {
  requireEditableDraft(branch);
  // Omission preserves saved progress; explicit null clears a draft field.
  return mainBranchDraftSchema.parse({ ...branch, ...input });
}
export function applyHostelBasics(branch: MainBranchDraft, input: HostelBasicsInput) {
  requireEditableDraft(branch);
  const fields: Partial<HostelBasicsInput> = { ...input };
  delete fields.name;
  delete fields.logoFileId;
  return mainBranchDraftSchema.parse({ ...branch, ...fields });
}
export type SetupArea = {
  id: string;
  cityId: string;
  parentId: string | null;
  level: 'zone' | 'area' | 'sector' | 'sub_area';
  isActive: boolean;
};
export function requireDraftGeography(
  branch: MainBranchDraft,
  city: { id: string; isActive: boolean } | undefined,
  area: SetupArea | undefined,
  subArea: SetupArea | undefined,
) {
  const unavailable = () => {
    throw new DomainError('NOT_FOUND', 404, 'Location unavailable');
  };
  if (branch.cityId && (!city?.isActive || city.id !== branch.cityId)) unavailable();
  if (
    branch.areaId &&
    (!branch.cityId ||
      !area?.isActive ||
      area.id !== branch.areaId ||
      area.cityId !== branch.cityId ||
      area.level === 'sub_area')
  )
    unavailable();
  if (
    branch.subAreaId &&
    (!branch.areaId ||
      !subArea?.isActive ||
      subArea.id !== branch.subAreaId ||
      subArea.cityId !== branch.cityId ||
      subArea.level !== 'sub_area' ||
      subArea.parentId !== branch.areaId)
  )
    unavailable();
}
