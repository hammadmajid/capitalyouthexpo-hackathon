'use client';
import { useState } from 'react';
import type { ApiClient, OwnerSetupActions } from '@hsm/api-client';
import type { HostelOnboarding } from '@hsm/contracts';
import { Button } from '../ui/button';
import { SetupOverview } from './setup-overview';
import { SetupStepBody } from './setup-step-body';
import {
  canSkipSetupStep,
  setupStepKeys,
  setupStepLocked,
  stepCopy,
  type DraftProgress,
  type SetupStep,
} from './setup-steps';
import { AddBranchOverview, SetupBranches } from './setup-branches';
import { useSetupProgress, type SetupTarget } from './use-setup-draft';
import { usesRevision } from '../hostel-revision/revision-fields';
type Props = {
  actorId: string;
  brandId: string;
  client: ApiClient;
  actions: OwnerSetupActions;
  leave: () => void;
};
// HSM-SETUP: one canonical flow over the server-saved draft, like the mobile Hostel Setup.
// Leaving and coming back resumes from saved state; nothing is kept only in the browser.
export function SetupWizard(props: Props) {
  const [step, setStep] = useState<SetupStep>(),
    [target, setTarget] = useState<SetupTarget>({});
  const { hostel, progress } = useSetupProgress(props.actorId, props.brandId, target);
  const choose = (next: SetupTarget) => {
    setTarget(next);
    setStep(undefined);
  };
  if (hostel.isError)
    return (
      <section className="space-y-3">
        <p role="alert">Unable to load this hostel.</p>
        <Button onClick={() => void hostel.refetch()}>Retry hostel</Button>
        <Button variant="ghost" onClick={props.leave}>
          Back to my hostels
        </Button>
      </section>
    );
  if (!hostel.data) return <p role="status">Loading your saved draft…</p>;
  if (!step && target.adding)
    return (
      <AddBranchOverview
        hostel={hostel.data}
        start={() => setStep('basics')}
        back={() => choose({})}
      />
    );
  if (!step)
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={target.branchId ? () => choose({}) : props.leave}>
          {target.branchId ? 'Back to hostel' : 'Back to my hostels'}
        </Button>
        <SetupOverview
          hostel={hostel.data}
          progress={progress}
          open={setStep}
          branch={Boolean(target.branchId)}
        />
        {target.branchId ? null : (
          <SetupBranches actorId={props.actorId} hostel={hostel.data} open={choose} />
        )}
      </div>
    );
  return (
    <SetupStepFrame
      {...props}
      hostel={hostel.data}
      progress={progress}
      step={step}
      go={setStep}
      target={target}
      // BRN-001: the first save of a new branch continues that branch's own setup.
      added={(branchId) => {
        setTarget({ branchId });
        setStep('location');
      }}
    />
  );
}
function SetupStepFrame(
  props: Props & {
    hostel: HostelOnboarding;
    progress: DraftProgress;
    step: SetupStep;
    go: (step: SetupStep | undefined) => void;
    target: SetupTarget;
    added: (branchId: string) => void;
  },
) {
  const { step, go } = props,
    index = setupStepKeys.indexOf(step),
    copy = stepCopy[step],
    following = setupStepKeys[index + 1],
    next = () => go(following),
    // CHG-041: an approved hostel edits its name and location through a revision instead.
    { adding, branchId } = props.target,
    revising = !adding && !branchId && usesRevision(props.hostel),
    locked = !adding && !revising && setupStepLocked(props.hostel, step),
    ownSave = step === 'basics' || step === 'location' || step === 'review';
  return (
    <section aria-label={copy.title} className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => go(setupStepKeys[index - 1])}>
          Back
        </Button>
        <Button variant="ghost" onClick={() => go(undefined)}>
          All steps
        </Button>
        {!adding && canSkipSetupStep(step, copy.optional, props.brandId) ? (
          <Button variant="ghost" onClick={next}>
            Skip
          </Button>
        ) : null}
      </nav>
      <header>
        <p className="text-sm font-semibold text-hsm-primary">
          Step {index + 1} of {setupStepKeys.length}
        </p>
        <h2 className="text-2xl font-bold text-hsm-heading">{copy.title}</h2>
        <p className="text-hsm-secondary">{copy.description}</p>
      </header>
      {locked ? (
        <p role="status">
          {props.hostel.mainBranch?.verificationStatus === 'approved'
            ? 'Approved · name and location of this branch are locked.'
            : 'Submitted · locked until HSM requests changes.'}
        </p>
      ) : (
        <SetupStepBody
          key={step}
          actorId={props.actorId}
          hostel={props.hostel}
          branchId={adding ? undefined : props.hostel.mainBranch?.id}
          target={props.target}
          revising={revising}
          added={props.added}
          progress={props.progress}
          step={step}
          client={props.client}
          actions={props.actions}
          next={next}
        />
      )}
      {(!ownSave || locked) && following ? <Button onClick={next}>Continue</Button> : null}
    </section>
  );
}
