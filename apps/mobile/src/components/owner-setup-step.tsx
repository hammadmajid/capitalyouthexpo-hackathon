import { OwnerPoliciesStep } from './owner-policies-step';
import { Skeleton } from './loading/skeleton';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StaffSetup } from './staff/staff-setup';
import { canSkipSetupStep } from './owner-setup-steps';
import { VisitingHours } from './visiting-hours';
import { NativePaymentSettings } from './native-payment-settings';
import { ToolFrame } from './inventory-tools';
import { useVisitCommand } from './use-visit-command';
import { useHostelRevision, usesRevision, withRevision } from './use-hostel-revision';
import { OwnerRevisionPanel } from './owner-revision-panel';
import {
  hostelOnboardingStateSchema,
  type HostelBasicsInput,
  type HostelOnboarding,
  type MainBranchDraftInput,
} from '@hsm/contracts';
import { safeMessage } from '../lib/messages';
import { SetupButton, SetupCard, SetupShell, SetupText } from './owner-wizard-ui';
import { stepCopy } from './owner-setup-overview';
import {
  keepSetupDraft,
  leaveSetup,
  setupBack,
  replaceSetupStep,
  setupDraft,
  type RoomsLevel,
  type SetupBranch,
} from './owner-setup-nav';
import { OwnerBasicStep } from './owner-basic-step';
import { OwnerLocationStep } from './owner-location-step';
import { OwnerRoomsStep } from './owner-rooms-step';
import { OwnerPhotosStep } from './owner-photos-step';
import { OwnerAmenitiesStep } from './owner-amenities-step';
import { OwnerReviewStep } from './owner-review-step';
import { useOwnerSetupCommand } from './use-owner-setup-command';
import { useOwnerLocation } from './use-owner-location';
import {
  setupStepLocked,
  setupStepKeys,
  useOwnerDraftDetails,
  useOwnerHostel,
  useOwnerOrganization,
  type SetupStep,
} from './use-owner-draft';
type Props = {
  actorId: string;
  brandId: string | undefined;
  branch?: SetupBranch;
  step: SetupStep;
  level: RoomsLevel;
};
// BRN-001: name for a new branch until the Owner renames it in Location & Address.
const newBranchName = 'New branch';
function branchInput(input: HostelBasicsInput, name: string): MainBranchDraftInput {
  const fields: Partial<HostelBasicsInput> = { ...input };
  delete fields.logoFileId;
  return { ...fields, name };
}
export function OwnerSetupStep({ actorId, brandId, branch = {}, step, level }: Props) {
  const hostel = useOwnerHostel(actorId, brandId, branch.branchId);
  const adding = Boolean(branch.addBranch);
  const index = setupStepKeys.indexOf(step);
  const copy = stepCopy[step];
  const nextKey = setupStepKeys[index + 1];
  const drillDown = Boolean(level.buildingId || level.floorId || level.roomId || level.add);
  const back = useCallback(
    () => setupBack(step, setupStepKeys, brandId, drillDown),
    [step, brandId, drillDown],
  );
  // Android Back follows the same path as the on-screen arrow.
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => listener.remove();
  }, [back]);
  return (
    <SetupShell
      title={copy.title}
      step={index + 1}
      back={back}
      staffLayout={step === 'staff'}
      footer={
        step === 'staff' && brandId && hostel.data && !adding ? (
          <SetupButton
            label="Continue"
            onPress={() => replaceSetupStep(nextKey ?? 'review', brandId)}
          />
        ) : undefined
      }
      skip={
        brandId && canSkipSetupStep(step, copy.optional, brandId, drillDown)
          ? () => replaceSetupStep(nextKey ?? 'review', brandId)
          : undefined
      }
    >
      {hostel.isError ? (
        <SetupCard>
          <SetupText alert>{safeMessage(hostel.error)}</SetupText>
        </SetupCard>
      ) : brandId && !hostel.data ? (
        <Skeleton kind="list" label="Loading your saved draft…" />
      ) : (!brandId || adding) && step !== 'basics' ? (
        <SetupCard>
          <SetupText>Save Basic Information first.</SetupText>
          <SetupButton label="Go to Basic Information" onPress={() => leaveSetup()} />
        </SetupCard>
      ) : (
        <StepBody
          actorId={actorId}
          step={step}
          data={adding ? undefined : hostel.data}
          template={adding ? hostel.data : undefined}
          branchId={branch.branchId}
          next={nextKey}
          level={level}
        />
      )}
    </SetupShell>
  );
}
function StepBody({
  actorId,
  step,
  data,
  template,
  branchId: selected,
  next,
  level,
}: {
  level: RoomsLevel;
  actorId: string;
  step: SetupStep;
  data: HostelOnboarding | undefined;
  // Adding a branch: the hostel whose basics prefill the new branch's first step.
  template: HostelOnboarding | undefined;
  branchId: string | undefined;
  next: SetupStep | undefined;
}) {
  const organizations = useOwnerOrganization(actorId);
  const organizationId = data?.organizationId ?? organizations.data?.[0]?.id;
  const command = useOwnerSetupCommand(
    actorId,
    data?.id ?? template?.id ?? organizationId ?? 'pending',
  );
  const details = useOwnerDraftDetails(actorId, data?.mainBranch?.id);
  const location = useOwnerLocation(step === 'location' ? actorId : undefined);
  const draftKey =
    actorId +
    ':' +
    (data?.id ?? (template ? template.id + ':add' : 'new')) +
    ':' +
    (selected ?? 'main') +
    ':' +
    step;
  const change = useCallback(
    (values: Record<string, string>) => keepSetupDraft(draftKey, values),
    [draftKey],
  );
  // CHG-041: an approved hostel stays live; basics/location edits go to pending changes.
  const revising = !template && usesRevision(data, selected);
  const revision = useHostelRevision(actorId, data?.id, revising);
  const shown = revising && data ? withRevision(data, revision.open) : data;
  const busy =
    command.isPending ||
    command.unresolved ||
    revision.command.isPending ||
    revision.command.unresolved;
  async function revise(part: { basics: HostelBasicsInput } | { main: MainBranchDraftInput }) {
    await revision.command.mutateAsync({
      kind: 'save',
      expectedVersion: revision.open?.version ?? null,
      ...part,
    });
  }
  async function saveBasics(input: HostelBasicsInput) {
    if (revising && data) {
      await revise({ basics: input });
      keepSetupDraft(draftKey, undefined);
      replaceSetupStep('location', data.id);
      return;
    }
    if (template) {
      const added = hostelOnboardingStateSchema.parse(
        await command.mutateAsync({
          kind: 'add-branch',
          brandId: template.id,
          input: branchInput(input, newBranchName),
        }),
      );
      keepSetupDraft(draftKey, undefined);
      replaceSetupStep('location', added.id, added.mainBranchId ?? undefined);
      return;
    }
    if (data && selected) {
      await command.mutateAsync({
        kind: 'branch',
        brandId: data.id,
        branchId: selected,
        input: branchInput(input, data.mainBranch?.name ?? newBranchName),
      });
      keepSetupDraft(draftKey, undefined);
      replaceSetupStep('location', data.id);
      return;
    }
    if (!data && !organizationId) return;
    const saved = hostelOnboardingStateSchema.parse(
      await command.mutateAsync(
        data
          ? { kind: 'basics', brandId: data.id, input }
          : { kind: 'create', organizationId: organizationId ?? '', input },
      ),
    );
    keepSetupDraft(draftKey, undefined);
    replaceSetupStep('location', saved.id);
  }
  async function saveMain(input: MainBranchDraftInput) {
    if (!data) return;
    if (revising) {
      await revise({ main: input });
      keepSetupDraft(draftKey, undefined);
      replaceSetupStep('review', data.id);
      return;
    }
    await command.mutateAsync(
      selected
        ? { kind: 'branch', brandId: data.id, branchId: selected, input }
        : { kind: 'main', brandId: data.id, input },
    );
    keepSetupDraft(draftKey, undefined);
    replaceSetupStep(next, data.id);
  }
  const recovery =
    command.unresolved && !command.isPending ? (
      <SetupCard>
        <SetupText alert>Last save did not finish. Retry it first.</SetupText>
        <SetupButton label="Retry previous save" onPress={() => command.retryOriginal()} />
      </SetupCard>
    ) : null;
  const error = command.error ?? revision.command.error;
  const failure = error ? <SetupText alert>{safeMessage(error)}</SetupText> : null;
  if (revising && data && (step === 'basics' || step === 'location' || step === 'review')) {
    if (revision.query.isPending) return <Skeleton kind="list" label="Loading your changes…" />;
    if (step === 'review' || revision.open?.status === 'submitted')
      return <OwnerRevisionPanel actorId={actorId} brandId={data.id} />;
  }
  const approved = data?.mainBranch?.verificationStatus === 'approved';
  if (!revising && setupStepLocked(data, step))
    return (
      <SetupCard>
        <SetupText>
          {approved
            ? 'Approved · name and location of this branch are locked.'
            : 'Submitted · locked until HSM requests changes.'}
        </SetupText>
        {data ? (
          <SetupButton label="Review status" onPress={() => replaceSetupStep('review', data.id)} />
        ) : null}
      </SetupCard>
    );
  const branchId = data?.mainBranch?.id;
  switch (step) {
    case 'basics':
      return (
        <>
          {recovery}
          <OwnerBasicStep
            data={shown ?? template}
            fixedName={template || selected ? (data ?? template)?.name : undefined}
            draft={setupDraft(draftKey)}
            disabled={busy || (!organizationId && !template)}
            change={change}
            save={saveBasics}
          />
          {failure}
        </>
      );
    case 'location':
      return data ? (
        <>
          {recovery}
          <OwnerLocationStep
            actorId={actorId}
            data={shown ?? data}
            location={location}
            draft={setupDraft(draftKey)}
            disabled={busy}
            change={change}
            save={saveMain}
          />
          {failure}
        </>
      ) : null;
    case 'rooms':
      return branchId && data ? (
        <OwnerRoomsStep
          actorId={actorId}
          branchId={branchId}
          brandId={data.id}
          level={level}
          next={() => replaceSetupStep(next, data.id)}
        />
      ) : null;
    case 'photos':
      return branchId && data ? (
        <OwnerPhotosStep
          actorId={actorId}
          branchId={branchId}
          next={() => replaceSetupStep(next, data.id)}
        />
      ) : null;
    case 'amenities':
      return branchId && data ? (
        <OwnerAmenitiesStep
          actorId={actorId}
          branchId={branchId}
          listing={details.listing}
          next={() => replaceSetupStep(next, data.id)}
        />
      ) : null;
    case 'policies':
      return branchId && data ? (
        <OwnerPoliciesStep
          actorId={actorId}
          branchId={branchId}
          next={() => replaceSetupStep(next, data.id)}
        />
      ) : null;
    case 'visits':
      return branchId && data ? (
        <SetupVisitingHours
          actorId={actorId}
          branchId={branchId}
          next={() => replaceSetupStep(next, data.id)}
        />
      ) : null;
    case 'payments':
      return branchId && data ? (
        <SetupPayments
          actorId={actorId}
          branchId={branchId}
          next={() => replaceSetupStep(next, data.id)}
        />
      ) : null;
    case 'staff':
      return branchId && data ? <StaffSetup actorId={actorId} branchId={branchId} /> : null;
    case 'review':
      return data ? (
        <OwnerReviewStep
          actorId={actorId}
          data={data}
          details={details}
          submitting={busy}
          error={command.error}
          submit={async () => {
            await command.mutateAsync(
              selected
                ? { kind: 'branch-submit', brandId: data.id, branchId: selected }
                : { kind: 'submit', brandId: data.id },
            );
          }}
        />
      ) : null;
  }
}
// CHG-050 / BKG-007 / BR-01: where residents pay the hostel directly; Continue waits while an
// account is typed but not added, so it is never dropped.
function SetupPayments(props: { actorId: string; branchId: string; next: () => void }) {
  const [typing, setTyping] = useState(false);
  return (
    <View style={{ gap: 14 }}>
      <SetupCard>
        <ToolFrame close={() => undefined}>
          <NativePaymentSettings
            actorId={props.actorId}
            branchId={props.branchId}
            owner
            onUnsavedChange={setTyping}
          />
        </ToolFrame>
      </SetupCard>
      <SetupButton
        label={typing ? 'Add the account first' : 'Continue'}
        disabled={typing}
        onPress={props.next}
      />
    </View>
  );
}
// VISIT-001: set once while setting up; later changes stay possible from this step.
function SetupVisitingHours(props: { actorId: string; branchId: string; next: () => void }) {
  const operation = useVisitCommand(props.actorId);
  return (
    <View style={{ gap: 14 }}>
      <VisitingHours
        operation={operation}
        actorId={props.actorId}
        branchId={props.branchId}
        accessUnavailable={false}
        onContinue={props.next}
      />
    </View>
  );
}
