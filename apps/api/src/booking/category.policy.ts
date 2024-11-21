import { DomainError } from '@hsm/contracts';
// BKG-001 / SRS p21: unsupported or incompatible category/gender combinations fail closed.
export function requireBookingCategory(gender: unknown, category: unknown) {
  const male = category === 'boys' || category === 'working_male';
  const female = category === 'girls' || category === 'working_female';
  if ((male && gender === 'male') || (female && gender === 'female')) return;
  throw new DomainError('FORBIDDEN', 403, 'Booking profile does not meet hostel eligibility');
}
