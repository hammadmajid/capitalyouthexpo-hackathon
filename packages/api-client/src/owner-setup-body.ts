import type { HostelBasicsInput, MainBranchDraftInput, ManagementPage } from '@hsm/contracts';
// JSON omission preserves draft fields; explicit null/false must survive serialization.
function contact(input: HostelBasicsInput) {
  return {
    name: input.name,
    ...(input.propertyTier !== undefined ? { propertyTier: input.propertyTier } : {}),
    ...(input.establishmentYear !== undefined
      ? { establishmentYear: input.establishmentYear }
      : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.showPublicContact !== undefined
      ? { showPublicContact: input.showPublicContact }
      : {}),
  };
}
export function setupBasicsBody(input: HostelBasicsInput) {
  return {
    ...contact(input),
    ...(input.logoFileId !== undefined ? { logoFileId: input.logoFileId } : {}),
  };
}
export function setupMainBody(input: MainBranchDraftInput) {
  return {
    ...contact(input),
    ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
    ...(input.areaId !== undefined ? { areaId: input.areaId } : {}),
    ...(input.subAreaId !== undefined ? { subAreaId: input.subAreaId } : {}),
    ...(input.addressLine !== undefined ? { addressLine: input.addressLine } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.nearbyLandmark !== undefined ? { nearbyLandmark: input.nearbyLandmark } : {}),
  };
}
export function setupPageQuery(input: ManagementPage) {
  return { limit: input.limit, ...(input.cursor !== undefined ? { cursor: input.cursor } : {}) };
}
