'use client';
import { useRef } from 'react';
import type { ManualAdmissionCommand, ManualStayInput } from '@hsm/contracts';
import { AdmissionBillingReview } from './admission-billing-review';
import { useManualAdmission } from '../lib/use-manual-admission';
import { useInventoryNavigationLock } from './inventory-navigation';
import {
  AdmissionRecorded,
  AdmissionSubmissionState,
  type AdmissionLabels,
} from './admission-submission-state';
type Props = AdmissionLabels & {
  actorId: string;
  branchId: string;
  manual: ManualStayInput;
  // CHG-054: an optional private CNIC photo, only for a new resident.
  cnicPhoto?: string;
  unavailable: boolean;
  onBack: () => void;
  onDone: () => void;
};
export function AdmissionSubmission(props: Props) {
  return <Submission key={props.actorId + ':' + props.branchId} {...props} />;
}
function Submission(props: Props) {
  const state = useManualAdmission(props.actorId, props.branchId, props.unavailable),
    labels = useRef<AdmissionLabels>(props);
  useInventoryNavigationLock(true);
  function submit(command: ManualAdmissionCommand) {
    if (!state.lockedCommand)
      labels.current = {
        branchLabel: props.branchLabel,
        residentLabel: props.residentLabel,
        targetLabel: props.targetLabel,
      };
    state.mutation.mutate(
      props.cnicPhoto && command.manual.resident.kind === 'new'
        ? { ...command, cnicPhotoFileId: props.cnicPhoto }
        : command,
    );
  }
  const snapshot = state.lockedCommand ? labels.current : props;
  if (state.completed)
    return (
      <AdmissionRecorded
        labels={snapshot}
        allowed={state.allowed}
        refreshFailed={state.refreshFailed}
        onDone={props.onDone}
        actorId={props.actorId}
        {...(state.mutation.data ? { admitted: state.mutation.data } : {})}
      />
    );
  return (
    <section className="space-y-3">
      <AdmissionSubmissionState
        allowed={state.allowed}
        loading={state.access.isPending || state.access.isFetching}
        disabled={props.unavailable || state.access.isFetching || state.mutation.isPending}
        error={state.mutation.error}
        onRefresh={() => void state.access.refetch()}
      />
      <AdmissionBillingReview
        actorId={props.actorId}
        branchId={props.branchId}
        branchLabel={snapshot.branchLabel}
        residentLabel={snapshot.residentLabel}
        targetLabel={snapshot.targetLabel}
        manual={state.lockedCommand?.manual ?? props.manual}
        pending={state.mutation.isPending}
        unavailable={!state.allowed}
        uncertain={state.uncertain}
        onAdmit={submit}
        onBack={props.onBack}
      />
    </section>
  );
}
