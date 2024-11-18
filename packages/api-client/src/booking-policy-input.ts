import { bookingOverrideInputSchema, type BookingPolicy } from '@hsm/contracts';
type WireOverride = { [Key in keyof BookingPolicy]?: BookingPolicy[Key] | null };
// BKG-006: omit undefined wire properties; explicit null remains inheritance.
export function bookingPolicyOverrideBody(input: unknown) {
  const { overrides: source } = bookingOverrideInputSchema.parse(input);
  const overrides: WireOverride = {};
  if (source.bookingMode !== undefined) overrides.bookingMode = source.bookingMode;
  if (source.holdSeconds !== undefined) overrides.holdSeconds = source.holdSeconds;
  if (source.requestExpirySeconds !== undefined)
    overrides.requestExpirySeconds = source.requestExpirySeconds;
  if (source.requestReservesInventory !== undefined)
    overrides.requestReservesInventory = source.requestReservesInventory;
  if (source.minimumStayDays !== undefined) overrides.minimumStayDays = source.minimumStayDays;
  if (source.maximumStayDays !== undefined) overrides.maximumStayDays = source.maximumStayDays;
  if (source.minimumAdvanceDays !== undefined)
    overrides.minimumAdvanceDays = source.minimumAdvanceDays;
  if (source.maximumAdvanceDays !== undefined)
    overrides.maximumAdvanceDays = source.maximumAdvanceDays;
  if (source.customerSelectsInventory !== undefined)
    overrides.customerSelectsInventory = source.customerSelectsInventory;
  if (source.cancellationAllowed !== undefined)
    overrides.cancellationAllowed = source.cancellationAllowed;
  if (source.cancellationCutoffHours !== undefined)
    overrides.cancellationCutoffHours = source.cancellationCutoffHours;
  if (source.allowedStayUnits !== undefined) overrides.allowedStayUnits = source.allowedStayUnits;
  if (source.allowEvidenceReuse !== undefined)
    overrides.allowEvidenceReuse = source.allowEvidenceReuse;
  if (source.documentReviewRequired !== undefined)
    overrides.documentReviewRequired = source.documentReviewRequired;
  if (source.requiredDocuments !== undefined)
    overrides.requiredDocuments = source.requiredDocuments;
  return { overrides };
}
