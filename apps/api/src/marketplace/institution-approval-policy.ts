export type InstitutionApproval = {
  publicApprovedAt: Date | null;
  publicApprovedByUserId: string | null;
};

// Preserve the original approval identity while approval remains active.
export function nextInstitutionApproval(
  current: InstitutionApproval | null,
  publicApproved: boolean,
  actorId: string,
  now: Date,
  reapprove = false,
): InstitutionApproval {
  if (!publicApproved) {
    return {
      publicApprovedAt: null,
      publicApprovedByUserId: null,
    };
  }

  if (!reapprove && current?.publicApprovedAt && current.publicApprovedByUserId) {
    return {
      publicApprovedAt: current.publicApprovedAt,
      publicApprovedByUserId: current.publicApprovedByUserId,
    };
  }

  return {
    publicApprovedAt: now,
    publicApprovedByUserId: actorId,
  };
}
