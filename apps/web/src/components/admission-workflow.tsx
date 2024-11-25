'use client';
import { useState, type ReactNode } from 'react';
import {
  type ManualStayInput,
  type branchInventorySchema,
  type roomTypeSummarySchema,
  type billingSettingsReadSchema,
  type BillingCatalogEntry,
} from '@hsm/contracts';
import type { z } from 'zod';
import { useAdmissionAccess } from '../lib/use-admission-access';
import { errorMessage } from '../lib/messages';
import { AdmissionResidentPicker } from './admission-resident-picker';
import { AdmissionTargetChoice } from './admission-target-choice';
import { AdmissionAgreementForm } from './admission-agreement-form';
import { AdmissionSubmission } from './admission-submission';
import { useInventoryNavigationLock } from './inventory-navigation';
import { Button } from './ui/button';
type Props = {
  actorId: string;
  branchId: string;
  branchLabel: string;
  roomType: z.infer<typeof roomTypeSummarySchema>;
  rooms: z.infer<typeof branchInventorySchema>['rooms'];
  settings: z.infer<typeof billingSettingsReadSchema>;
  catalog: BillingCatalogEntry[];
  pending: boolean;
  unavailable: boolean;
  navigation?: ReactNode;
  onRoom: (id: string) => void;
  onCancel: () => void;
  onDone: () => void;
};
type Resident = { value: ManualStayInput['resident']; label: string; cnicPhoto?: string };
type Target = { value: ManualStayInput['target']; label: string };
type Review = {
  manual: ManualStayInput;
  residentLabel: string;
  targetLabel: string;
  cnicPhoto?: string | undefined;
};
// STAY-001 / SEC-003: actual scoped data is supplied by the inventory host.
// Keep submitted/unknown commands mounted through refreshed authority or metadata.
export function AdmissionWorkflow(props: Props) {
  return <Workflow key={props.actorId + ':' + props.branchId} {...props} />;
}
function Workflow(props: Props) {
  const { access, allowed } = useAdmissionAccess(props.actorId, props.branchId, props.unavailable),
    [review, setReview] = useState<Review>();
  useInventoryNavigationLock(true);
  if (review)
    return (
      <AdmissionSubmission
        actorId={props.actorId}
        branchId={props.branchId}
        branchLabel={props.branchLabel}
        residentLabel={review.residentLabel}
        targetLabel={review.targetLabel}
        manual={review.manual}
        {...(review.cnicPhoto ? { cnicPhoto: review.cnicPhoto } : {})}
        unavailable={props.unavailable}
        onBack={() => setReview(undefined)}
        onDone={props.onDone}
      />
    );
  if (!allowed)
    return (
      <section aria-label="Admission access" className="space-y-3">
        <p role="alert">
          {access.error
            ? errorMessage(access.error)
            : 'Refresh current Stay, rent and finance access before admission.'}
        </p>
        <Button
          disabled={props.unavailable || access.isFetching}
          onClick={() => void access.refetch()}
        >
          Refresh admission access
        </Button>
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel admission
        </Button>
      </section>
    );
  return (
    <>
      {props.navigation}
      <Draft {...props} key={props.roomType.id} onReview={setReview} />
    </>
  );
}
function Draft(props: Props & { onReview: (review: Review) => void }) {
  const [resident, setResident] = useState<Resident>(),
    [target, setTarget] = useState<Target>();
  if (!resident)
    return (
      <AdmissionResidentPicker
        actorId={props.actorId}
        branchId={props.branchId}
        branchLabel={props.branchLabel}
        pending={props.pending}
        unavailable={props.unavailable}
        onChoose={(value, label, cnicPhoto) => {
          if (!props.pending && !props.unavailable)
            setResident({ value, label, ...(cnicPhoto ? { cnicPhoto } : {}) });
        }}
        onCancel={props.onCancel}
      />
    );
  if (!target)
    return (
      <section aria-label="Admission physical inventory" className="space-y-3">
        <AdmissionTargetChoice
          branchId={props.branchId}
          roomType={props.roomType}
          rooms={props.rooms}
          disabled={props.pending || props.unavailable}
          onRoom={props.onRoom}
          onChoose={(value, label) => {
            if (!props.pending && !props.unavailable) setTarget({ value, label });
          }}
        />
        <Button variant="ghost" disabled={props.pending} onClick={() => setResident(undefined)}>
          Back to resident selection
        </Button>
      </section>
    );
  return (
    <AdmissionAgreementForm
      actorId={props.actorId}
      branchId={props.branchId}
      roomTypeId={props.roomType.id}
      resident={resident.value}
      target={target.value}
      settings={props.settings}
      fees={props.roomType.fees}
      catalog={props.catalog}
      disabled={props.pending}
      unavailable={props.unavailable}
      onReview={(manual) => {
        if (!props.pending && !props.unavailable)
          props.onReview({
            manual,
            residentLabel: resident.label,
            targetLabel: target.label,
            cnicPhoto: resident.cnicPhoto,
          });
      }}
      onBack={() => setTarget(undefined)}
    />
  );
}
