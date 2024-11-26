'use client';
import type { ApiClient, OwnerSetupActions } from '@hsm/api-client';
import { OwnerRevisionPanel } from '../hostel-revision/owner-revision-panel';
import { useHostelRevision } from '../hostel-revision/use-hostel-revision';
import { OwnerBranchEditor } from '../owner-branch-editor';
type Props = {
  actorId: string;
  brandId: string;
  step: 'basics' | 'location' | 'review';
  client: ApiClient;
  actions: OwnerSetupActions;
  next: () => void;
};
// CHG-041 (as on mobile): an approved hostel stays live. Basic Information and Location save into
// one pending revision; Review sends it to HSM. While HSM reviews it, the forms stay closed.
export function RevisionStep({ actorId, brandId, step, ...props }: Props) {
  const revision = useHostelRevision(actorId, brandId);
  if (revision.query.isPending) return <p role="status">Loading your changes…</p>;
  if (step === 'review' || revision.query.isError || revision.open?.status === 'submitted')
    return <OwnerRevisionPanel revision={revision} />;
  return (
    <>
      {revision.open ? <p role="status">Editing your unsent changes.</p> : null}
      <OwnerBranchEditor
        userId={actorId}
        brandId={brandId}
        client={props.client}
        actions={props.actions}
        section={step}
        onSaved={props.next}
        revise={{ open: revision.open, save: revision.save }}
      />
    </>
  );
}
