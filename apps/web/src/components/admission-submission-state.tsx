'use client';
import { AgreementDocuments } from './agreements/agreement-documents';
import { Button } from './ui/button';
import { errorMessage } from '../lib/messages';
export type AdmissionLabels = { branchLabel: string; residentLabel: string; targetLabel: string };
export function AdmissionRecorded({
  labels,
  allowed,
  refreshFailed,
  onDone,
  actorId,
  admitted,
}: {
  labels: AdmissionLabels;
  allowed: boolean;
  refreshFailed: boolean;
  onDone: () => void;
  actorId: string;
  admitted?: { branchId: string; stayId: string; agreementId: string };
}) {
  return (
    <section aria-label="Admission recorded" className="space-y-3">
      <h3 className="text-lg font-semibold">Resident admitted</h3>
      {allowed ? (
        <p>
          {labels.residentLabel} · {labels.branchLabel} · {labels.targetLabel}
        </p>
      ) : null}
      <p>
        Initial charges and schedules were recorded. This action does not record a payment or
        receipt.
      </p>
      {refreshFailed ? (
        <p role="status">
          Admission succeeded. Refresh the resident and inventory lists to see the latest records.
        </p>
      ) : null}
      {/* STAY-002: the signed agreement photo is attached privately to the new Stay. */}
      {allowed && admitted ? (
        <AgreementDocuments
          actorId={actorId}
          target={{
            branchId: admitted.branchId,
            stayId: admitted.stayId,
            agreementId: admitted.agreementId,
          }}
        />
      ) : null}
      <Button onClick={onDone}>Done</Button>
    </section>
  );
}
export function AdmissionSubmissionState({
  allowed,
  loading,
  disabled,
  error,
  onRefresh,
}: {
  allowed: boolean;
  loading: boolean;
  disabled: boolean;
  error: unknown;
  onRefresh: () => void;
}) {
  return (
    <>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      {!allowed ? (
        <div>
          {loading ? <p role="status">Checking admission access…</p> : null}
          <Button variant="secondary" disabled={disabled} onClick={onRefresh}>
            Refresh admission access
          </Button>
        </div>
      ) : null}
    </>
  );
}
