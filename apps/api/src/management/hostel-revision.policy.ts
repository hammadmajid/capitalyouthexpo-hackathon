import {
  DomainError,
  hostelRevisionChangesSchema,
  mainBranchDraftSchema,
  type HostelRevisionChanges,
  type MainBranchDraft,
  type SaveHostelRevision,
} from '@hsm/contracts';
import { missingSetupFields } from './hostel-setup.policy.js';
// CHG-041: only an approved hostel takes a revision; everything earlier uses normal setup.
export function requireRevisable(
  branch: MainBranchDraft | null,
): asserts branch is MainBranchDraft {
  if (!branch || branch.verificationStatus !== 'approved')
    throw new DomainError(
      'CONFLICT',
      409,
      'Only an approved hostel can send changes for re-verification',
    );
}
// Later saves of the same part replace it; the other part is kept.
export function mergeChanges(
  previous: HostelRevisionChanges | null,
  input: Pick<SaveHostelRevision, 'basics' | 'main'>,
): HostelRevisionChanges {
  return hostelRevisionChangesSchema.parse({
    basics: input.basics ?? previous?.basics ?? null,
    main: input.main ?? previous?.main ?? null,
  });
}
// The branch as it would look once approved. Basics never rename the branch row here, the
// same as normal setup; name and logo belong to the hostel (brand).
export function previewBranch(live: MainBranchDraft, changes: HostelRevisionChanges) {
  const basics: Record<string, unknown> = { ...(changes.basics ?? {}) };
  delete basics.name;
  delete basics.logoFileId;
  return mainBranchDraftSchema.parse({ ...live, ...basics, ...(changes.main ?? {}) });
}
export function requireCompleteRevision(preview: MainBranchDraft) {
  const missing = missingSetupFields(preview);
  if (missing.length)
    throw new DomainError(
      'VALIDATION_FAILED',
      422,
      'Complete these before sending: ' + missing.join(', ').replaceAll('_', ' '),
    );
}
export function requireVersion(actual: number | null, expected: number | null) {
  if (actual !== expected)
    throw new DomainError(
      'PRECONDITION_FAILED',
      412,
      'These changes were updated elsewhere; reload first',
    );
}
