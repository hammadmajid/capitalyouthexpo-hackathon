import {
  ownerBasicsForm,
  ownerMainForm,
  type ApiClient,
  type ownerBranchSetupActions,
  type OwnerSetupActions,
} from '@hsm/api-client';
import type { HostelOnboarding, HostelRevision } from '@hsm/contracts';
import type { RevisionPart } from './hostel-revision/use-hostel-revision';
import type { SetupTarget } from './setup-wizard/use-setup-draft';
export const newBranchName = 'New branch';
type Geography = { cityId: string | null; areaId: string | null; subAreaId: string | null };
export type EditorTarget = {
  brandId: string;
  client: ApiClient;
  actions: OwnerSetupActions;
  target?: SetupTarget | undefined;
  onAdded?: ((branchId: string) => void) | undefined;
  revise?: { open: HostelRevision | null; save: (part: RevisionPart) => Promise<unknown> };
};
// One place decides where a save goes: the hostel draft, a pending revision (CHG-041), an
// additional branch, or a new branch (BRN-001). Branch saves keep the hostel name fixed.
// `branch` must be kept across renders so an uncertain retry reuses its idempotency key.
export function editorSaves(
  props: EditorTarget,
  data: HostelOnboarding,
  branch: ReturnType<typeof ownerBranchSetupActions>,
) {
  const branchId = props.target?.branchId,
    adding = Boolean(props.target?.adding);
  const saved = props.revise
    ? 'Changes saved. Send them for re-verification.'
    : branchId || adding
      ? 'Branch saved.'
      : undefined;
  async function basics(input: Record<string, string>, logo: string | undefined) {
    if (adding || branchId) {
      const fields = ownerBasicsForm({ ...input, hostelName: data.name });
      if (branchId)
        await branch.save(props.brandId, branchId, {
          ...fields,
          name: data.mainBranch?.name ?? newBranchName,
        });
      else {
        const added = await branch.add(props.brandId, { ...fields, name: newBranchName });
        if (added.mainBranchId) props.onAdded?.(added.mainBranchId);
      }
      return saved ?? 'Hostel basics saved.';
    }
    const fields = ownerBasicsForm(input, logo);
    if (props.revise) await props.revise.save({ basics: fields });
    else await props.actions.basics(props.brandId, fields);
    return saved ?? 'Hostel basics saved.';
  }
  async function main(input: Record<string, string>, geography: Geography) {
    // Never fall through to the main branch while a new branch has not been created yet.
    if (adding) throw new Error('Save Basic Information first.');
    const fields = ownerMainForm(input, geography);
    if (branchId) await branch.save(props.brandId, branchId, fields);
    else if (props.revise) await props.revise.save({ main: fields });
    else await props.actions.main(props.brandId, fields);
    return saved ?? 'Main branch saved.';
  }
  async function submit() {
    if (adding) throw new Error('Save Basic Information first.');
    if (branchId) await branch.submit(props.brandId, branchId);
    else await props.actions.submit(props.brandId);
  }
  return { basics, main, submit, branchMode: adding || Boolean(branchId) };
}
