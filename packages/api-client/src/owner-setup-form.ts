import {
  hostelBasicsInputSchema,
  mainBranchDraftInputSchema,
  managerInvitationInputSchema,
} from '@hsm/contracts';
import { z } from 'zod';
const optional = (value: string | undefined) => value?.trim() || null;
function metadata(input: Record<string, string>) {
  const year = optional(input.establishmentYear);
  return {
    ...(Object.hasOwn(input, 'propertyTier') ? { propertyTier: optional(input.propertyTier) } : {}),
    ...(Object.hasOwn(input, 'establishmentYear')
      ? {
          establishmentYear:
            year === null
              ? null
              : z
                  .string()
                  .regex(/^\d{4}$/)
                  .transform(Number)
                  .parse(year),
        }
      : {}),
  };
}
export function ownerBasicsForm(input: Record<string, string>, logoFileId?: string) {
  return hostelBasicsInputSchema.parse({
    name: input.hostelName,
    ...metadata(input),
    category: optional(input.hostelCategory),
    description: optional(input.hostelDescription),
    phone: optional(input.hostelPhone),
    ...(logoFileId ? { logoFileId } : {}),
  });
}
export function ownerMainForm(
  input: Record<string, string>,
  geography: { cityId: string | null; areaId: string | null; subAreaId: string | null },
) {
  const latitude = optional(input.latitude),
    longitude = optional(input.longitude);
  const location =
    latitude === null && longitude === null
      ? null
      : {
          latitude: z.string().min(1).transform(Number).pipe(z.number().finite()).parse(latitude),
          longitude: z.string().min(1).transform(Number).pipe(z.number().finite()).parse(longitude),
        };
  return mainBranchDraftInputSchema.parse({
    name: input.branchName,
    ...metadata(input),
    category: optional(input.branchCategory),
    description: optional(input.branchDescription),
    phone: optional(input.branchPhone),
    addressLine: optional(input.address),
    nearbyLandmark: optional(input.landmark),
    location,
    ...geography,
  });
}
export function ownerInvitationForm(input: Record<string, string>, manual: boolean) {
  return managerInvitationInputSchema.parse({
    fullName: input.managerName,
    phone: input.managerPhone,
    temporaryCredential: manual
      ? { mode: 'manual', password: input.temporaryPassword }
      : { mode: 'auto' },
  });
}
