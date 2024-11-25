'use client';
import type { ManualAdmissionCommand, ManualStayInput } from '@hsm/contracts';
import { AdmissionBillingFields } from './admission-billing-fields';
import { AdmissionReviewSummary } from './admission-review-summary';
import { AdmissionConfirmation } from './admission-confirmation';
import { useAdmissionBillingDraft } from './use-admission-billing-draft';
import { Button } from './ui/button';
type Props = {
  actorId: string;
  branchId: string;
  branchLabel: string;
  residentLabel: string;
  targetLabel: string;
  manual: ManualStayInput;
  pending: boolean;
  unavailable: boolean;
  uncertain?: boolean;
  onAdmit: (command: ManualAdmissionCommand) => void;
  onBack: () => void;
};
export function AdmissionBillingReview(props: Props) {
  if (props.unavailable && !props.pending && !props.uncertain)
    return (
      <p role="alert">Refresh branch access, inventory and agreement settings before admission.</p>
    );
  return (
    <Review
      key={props.actorId + ':' + props.branchId + ':' + JSON.stringify(props.manual)}
      {...props}
    />
  );
}
function Review(props: Props) {
  const { manual, pending, unavailable, uncertain = false } = props,
    draft = useAdmissionBillingDraft(manual, pending || uncertain, unavailable);
  if (unavailable)
    return (
      <p role="alert">Refresh branch access, inventory and agreement settings before admission.</p>
    );
  return (
    <section aria-label="Review resident admission" className="space-y-4">
      <h3 className="text-lg font-semibold">
        {draft.prepared ? 'Confirm admission' : 'Choose initial billing periods'}
      </h3>
      <AdmissionReviewSummary
        manual={manual}
        branchLabel={props.branchLabel}
        residentLabel={props.residentLabel}
        targetLabel={props.targetLabel}
      />
      {draft.invalid ? (
        <p role="alert">
          Choose valid billing period starts and supply any required partial-period amounts.
        </p>
      ) : null}
      <AdmissionBillingFields
        manual={manual}
        draft={draft}
        pending={pending}
        uncertain={uncertain}
      />
      {draft.prepared ? (
        <AdmissionConfirmation
          command={draft.prepared}
          pending={pending}
          uncertain={uncertain}
          confirmed={draft.confirmed}
          onConfirm={draft.confirm}
          onAdmit={props.onAdmit}
          onEdit={draft.edit}
        />
      ) : null}
      <Button variant="ghost" disabled={pending || uncertain} onClick={props.onBack}>
        Back to resident details
      </Button>
    </section>
  );
}
