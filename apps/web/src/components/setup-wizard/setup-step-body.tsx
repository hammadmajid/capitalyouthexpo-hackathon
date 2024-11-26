'use client';
import type { ApiClient, OwnerSetupActions } from '@hsm/api-client';
import type { HostelOnboarding } from '@hsm/contracts';
import { AgreementTemplate } from '../agreements/agreement-template';
import { BillingPolicySettings } from '../billing-policy-settings';
import { BookingPolicySettings } from '../booking-policy-settings';
import { ListingGallery } from '../listing-gallery';
import { ListingRules } from '../listing-rules';
import { ListingSettings } from '../listing-settings';
import { OwnerBranchEditor } from '../owner-branch-editor';
import { PaymentInstructionsSettings } from '../payment-instructions-settings';
import { RoomsPanel } from '../setup/rooms-panel';
import { MenuEditor } from '../services/menu';
import { TransportRoutesSetup } from '../services/transport-routes-setup';
import { StaffWorkspace } from '../staff/staff-workspace';
import { useVisitCommand } from '../use-visit-command';
import { VisitingHours } from '../visiting-hours';
import { RevisionStep } from './revision-step';
import type { DraftProgress, SetupStep } from './setup-steps';
import type { SetupTarget } from './use-setup-draft';
type Props = {
  actorId: string;
  hostel: HostelOnboarding;
  branchId: string | undefined;
  progress: DraftProgress;
  step: SetupStep;
  client: ApiClient;
  actions: OwnerSetupActions;
  next: () => void;
  target: SetupTarget;
  revising: boolean;
  added: (branchId: string) => void;
};
// HSM-SETUP: each step reuses the existing web tool for that data, so rules stay in one place.
export function SetupStepBody(props: Props) {
  const { actorId, hostel, branchId, step } = props;
  // BRN-001: a branch being added exists only after its first Basic Information save.
  if (props.target.adding && step !== 'basics')
    return <p role="status">Save Basic Information first.</p>;
  if ((step === 'basics' || step === 'location' || step === 'review') && props.revising)
    return (
      <RevisionStep
        actorId={actorId}
        brandId={hostel.id}
        step={step}
        client={props.client}
        actions={props.actions}
        next={props.next}
      />
    );
  if (step === 'basics' || step === 'location' || step === 'review')
    return (
      <>
        {step === 'review' ? <ReviewSummary progress={props.progress} /> : null}
        <OwnerBranchEditor
          userId={actorId}
          brandId={hostel.id}
          client={props.client}
          actions={props.actions}
          section={step}
          onSaved={props.next}
          target={props.target}
          onAdded={props.added}
        />
      </>
    );
  if (!branchId) return <p role="status">Save Location & Address first.</p>;
  switch (step) {
    case 'amenities':
      // As on mobile: amenities, then one card each for the food menu and transport.
      return (
        <div className="space-y-4">
          <ListingSettings actorId={actorId} branchId={branchId} />
          <MenuEditor actorId={actorId} branchId={branchId} />
          <TransportRoutesSetup actorId={actorId} branchId={branchId} />
        </div>
      );
    case 'policies':
      return (
        <div className="space-y-4">
          {/* RENT-001: the versioned billing editor; every change applies to new stays only. */}
          <BillingPolicySettings actorId={actorId} target={{ branchId }} />
          <AgreementTemplate actorId={actorId} branchId={branchId} />
          <BookingPolicySettings actorId={actorId} target={{ level: 'hostel', id: hostel.id }} />
          <ListingRules actorId={actorId} branchId={branchId} />
        </div>
      );
    case 'photos':
      return <ListingGallery actorId={actorId} branchId={branchId} title="Hostel photos" />;
    case 'visits':
      return <SetupVisitingHours actorId={actorId} branchId={branchId} />;
    case 'rooms':
      return <RoomsPanel actorId={actorId} branchId={branchId} />;
    case 'payments':
      // CHG-050 / BR-01: residents pay the hostel directly into these accounts.
      return <PaymentInstructionsSettings actorId={actorId} branchId={branchId} owner />;
    case 'staff':
      return <StaffWorkspace actorId={actorId} branchId={branchId} canSetUp />;
  }
}
function SetupVisitingHours({ actorId, branchId }: { actorId: string; branchId: string }) {
  const operation = useVisitCommand(actorId);
  return (
    <VisitingHours
      operation={operation}
      actorId={actorId}
      branchId={branchId}
      accessUnavailable={false}
    />
  );
}
function ReviewSummary({ progress }: { progress: DraftProgress }) {
  return (
    <dl className="grid grid-cols-2 gap-2 rounded-input border border-hsm-border p-3 text-sm">
      <dt>Rooms</dt>
      <dd>{progress.roomCount}</dd>
      <dt>Beds</dt>
      <dd>{progress.bedCount}</dd>
      <dt>Photos</dt>
      <dd>{progress.photos ? 'Added' : 'None yet'}</dd>
      <dt>Payment methods</dt>
      <dd>{progress.payments ? 'Added' : 'None yet'}</dd>
    </dl>
  );
}
