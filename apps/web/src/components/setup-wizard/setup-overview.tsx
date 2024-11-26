'use client';
import type { HostelOnboarding } from '@hsm/contracts';
import { Button } from '../ui/button';
import {
  nextSetupStep,
  setupStepKeys,
  stepCopy,
  type DraftProgress,
  type SetupStep,
} from './setup-steps';
const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted for verification',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};
function stepStatus(key: SetupStep, progress: DraftProgress) {
  if (progress[key]) return 'Saved';
  return stepCopy[key].optional ? 'Optional' : 'Required';
}
// HSM-SETUP: every step card reflects saved server state; Continue opens the first unsaved step.
export function SetupOverview(props: {
  hostel: HostelOnboarding;
  progress: DraftProgress;
  open: (step: SetupStep) => void;
  // BRN-001: an additional branch shows its own name and status.
  branch?: boolean;
}) {
  const { hostel, progress } = props,
    active = nextSetupStep(progress),
    status = hostel.mainBranch?.verificationStatus;
  return (
    <section aria-label={props.branch ? 'Branch Setup' : 'Hostel Setup'} className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold text-hsm-heading">
          {props.branch ? 'Branch Setup' : 'Hostel Setup'}
        </h2>
        <p className="text-hsm-secondary">
          {hostel.name}
          {props.branch && hostel.mainBranch ? ' · ' + hostel.mainBranch.name : ''} ·{' '}
          {setupStepKeys.length} steps
        </p>
        {status ? (
          <p role="status" className="text-sm font-semibold text-hsm-primary">
            {statusLabels[status] ?? status}
          </p>
        ) : null}
      </header>
      <ol className="space-y-2">
        {setupStepKeys.map((key, index) => {
          const copy = stepCopy[key],
            current = key === active && !progress.review;
          return (
            <li key={key}>
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => props.open(key)}
                className={
                  'flex w-full items-center gap-3 rounded-input border p-3 text-left ' +
                  (current ? 'border-hsm-primary bg-hsm-icy' : 'border-hsm-border bg-hsm-surface')
                }
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hsm-aqua font-semibold text-hsm-deep">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-hsm-heading">{copy.title}</span>
                  <span className="block text-sm text-hsm-secondary">{copy.description}</span>
                </span>
                <span
                  className={
                    'text-sm font-semibold ' +
                    (progress[key] ? 'text-hsm-success' : 'text-hsm-muted')
                  }
                >
                  {stepStatus(key, progress)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {progress.roomCount ? (
        <p className="text-sm text-hsm-secondary">
          {progress.roomCount} rooms · {progress.bedCount} beds saved
        </p>
      ) : null}
      <Button onClick={() => props.open(progress.review ? 'review' : active)}>
        {progress.review ? 'Review status' : 'Continue'}
      </Button>
    </section>
  );
}
