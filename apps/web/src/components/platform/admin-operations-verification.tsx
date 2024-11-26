'use client';
import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import {
  readVerificationDossier,
  readVerificationEvidence,
  readVerificationHistory,
  readVerificationQueue,
  submitVerificationDecision,
} from '@hsm/api-client';
import {
  nextVerificationStatus,
  verificationActionSchema,
  verificationStatusSchema,
  type VerificationDossier,
} from '@hsm/contracts';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import { VerificationResources } from './admin-operations-verification-resources';
import { VerificationSubmissionComparison } from './admin-verification-snapshots';
import {
  OperationConfirmation,
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
type Scope = ReturnType<typeof useOperationScope>;
export function VerificationOperations({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'verification', 'verification');
  const [status, setStatus] = useState('submitted'),
    [open, setOpen] = useState<string>();
  const queue = useInfiniteQuery({
    queryKey: [...scope.key, status],
    initialPageParam: undefined as string | undefined,
    gcTime: 0,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readVerificationQueue(c, {
            status,
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = queue.isError ? [] : (queue.data?.pages.flatMap((page) => page.data) ?? []);
  return (
    <OperationSection title="Hostel verification">
      <p>Hostels awaiting verification and prior verification decisions.</p>
      <label>
        Verification status
        <select
          aria-label="Verification status"
          className="field-input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOpen(undefined);
          }}
        >
          {verificationStatusSchema.options.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <OperationState
        pending={queue.isPending}
        error={queue.error}
        retry={() => void queue.refetch()}
        empty={!rows.length}
      />
      {rows.map((row) => (
        <Button key={row.branchId} variant="secondary" onClick={() => setOpen(row.branchId)}>
          Review {row.branchName} · {row.status}
        </Button>
      ))}
      {!queue.isPending && !queue.isError ? (
        <OperationPages
          hasMore={Boolean(queue.hasNextPage)}
          fetching={queue.isFetching}
          more={() => void queue.fetchNextPage()}
          refresh={() => void queue.refetch()}
        />
      ) : null}
      {open ? (
        <VerificationReview
          key={open}
          branchId={open}
          scope={scope}
          close={() => setOpen(undefined)}
        />
      ) : null}
    </OperationSection>
  );
}
function VerificationReview({
  branchId,
  scope,
  close,
}: {
  branchId: string;
  scope: Scope;
  close: () => void;
}) {
  const dossier = useQuery({
    queryKey: [...scope.key, 'dossier', branchId],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => scope.read((c) => readVerificationDossier(c, branchId), signal),
  });
  const history = useInfiniteQuery({
    queryKey: [...scope.key, 'history', branchId],
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readVerificationHistory(c, branchId, {
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const current = !dossier.isError && !dossier.isFetching ? dossier.data : undefined;
  return (
    <div className="space-y-4 border-t border-hsm-border pt-4">
      <Button variant="secondary" onClick={close}>
        Close verification dossier
      </Button>
      <OperationState
        pending={dossier.isPending || dossier.isFetching}
        error={dossier.error}
        retry={() => void dossier.refetch()}
      />
      {current ? (
        <>
          <h4 className="text-lg font-semibold">{current.branchName} dossier</h4>
          <dl>
            <dt>Status</dt>
            <dd>{current.status}</dd>
            <dt>Updated</dt>
            <dd>{current.updatedAt}</dd>
            <dt>Submitted</dt>
            <dd>{current.submittedAt ?? 'Not recorded'}</dd>
            <dt>Owner</dt>
            <dd>{current.owner.fullName}</dd>
            <dt>Completeness</dt>
            <dd>{current.completenessScore ?? 'Not available'}</dd>
            <dt>Address</dt>
            <dd>{current.addressLine ?? 'Not provided'}</dd>
          </dl>
          <p>Evidence source: current record. A historical submitted snapshot is not implied.</p>
          <VerificationEvidence dossier={current} scope={scope} />
          <VerificationResources branchId={branchId} scope={scope} />
          <VerificationSubmissionComparison branchId={branchId} scope={scope} />
          <VerificationDecision key={current.updatedAt} dossier={current} scope={scope} />
        </>
      ) : null}
      <h4 className="font-semibold">Verification history</h4>
      <OperationState
        pending={history.isPending}
        error={history.error}
        retry={() => void history.refetch()}
        empty={!history.data?.pages.some((page) => page.data.length)}
      />
      {!history.isError ? (
        <ol>
          {history.data?.pages
            .flatMap((page) => page.data)
            .map((event) => (
              <li key={event.id}>
                {event.fromStatus} → {event.toStatus} · {event.reviewerName} · {event.createdAt}
                <p>{event.reason ?? 'No reason recorded'}</p>
              </li>
            ))}
        </ol>
      ) : null}
      {!history.isError && history.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={history.isFetching}
          onClick={() => void history.fetchNextPage()}
        >
          Load more verification history
        </Button>
      ) : null}
    </div>
  );
}
function VerificationEvidence({ dossier, scope }: { dossier: VerificationDossier; scope: Scope }) {
  const [purpose, setPurpose] = useState('');
  const access = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (fileId: string) =>
      scope.read((c) =>
        readVerificationEvidence(c, dossier.branchId, fileId, { justification: purpose.trim() }),
      ),
  });
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">Restricted identity evidence</h4>
      <label>
        Document access purpose
        <textarea
          aria-label="Document access purpose"
          className="field-input"
          value={purpose}
          maxLength={500}
          disabled={access.isPending}
          onChange={(e) => {
            access.reset();
            setPurpose(e.target.value);
          }}
        />
      </label>
      {dossier.evidence.length ? (
        dossier.evidence.map((item) => (
          <div key={item.fileId}>
            <p>
              {item.side} · {item.mimeType} ·{' '}
              {item.available ? 'Available for authorized review' : 'Unavailable'}
            </p>
            <Button
              disabled={!item.available || purpose.trim().length < 8 || access.isPending}
              onClick={() => access.mutate(item.fileId)}
            >
              Access {item.side} evidence
            </Button>
          </div>
        ))
      ) : (
        <p>No identity attachments are available.</p>
      )}
      {access.isError ? <p role="alert">{errorMessage(access.error)}</p> : null}
      {access.data ? (
        <a className="text-link" href={access.data.url} target="_blank" rel="noreferrer">
          Open authorized document (expires {access.data.expiresAt})
        </a>
      ) : null}
      <p>Each explicit evidence access is audited. No automatic access retry.</p>
    </div>
  );
}
function VerificationDecision({ dossier, scope }: { dossier: VerificationDossier; scope: Scope }) {
  const [action, setAction] = useState<string>(),
    [reason, setReason] = useState(''),
    [reviewing, setReviewing] = useState(false);
  const decision = useCommand(
    'AdminVerification:decision',
    (
      input: { action: string; reason: string; expectedStatus: string; expectedUpdatedAt: string },
      key,
    ) => scope.read((c) => submitVerificationDecision(c, dossier.branchId, input, key)),
    [scope.key],
  );
  const locked = decision.isPending || decision.unresolved;
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">Verification decision</h4>
      <CommandRecovery command={decision} />
      <label>
        Decision action
        <select
          aria-label="Verification action"
          className="field-input"
          disabled={locked || reviewing}
          value={action ?? ''}
          onChange={(e) => setAction(e.target.value || undefined)}
        >
          <option value="">Choose an available action</option>
          {verificationActionSchema.options
            .filter((value) => nextVerificationStatus(dossier.status, value))
            .map((value) => (
              <option value={value} key={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
        </select>
      </label>
      <label>
        Verification reason
        <textarea
          aria-label="Verification reason"
          className="field-input"
          value={reason}
          maxLength={1000}
          disabled={locked || reviewing}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {reviewing && action ? (
        <OperationConfirmation
          label="verification decision"
          pending={decision.isPending}
          disabled={decision.unresolved}
          cancel={() => setReviewing(false)}
          confirm={() =>
            decision.mutate(
              {
                action,
                reason: reason.trim(),
                expectedStatus: dossier.status,
                expectedUpdatedAt: dossier.updatedAt,
              },
              { onSuccess: () => setReviewing(false) },
            )
          }
        />
      ) : (
        <Button disabled={!action || !reason.trim() || locked} onClick={() => setReviewing(true)}>
          Review verification decision
        </Button>
      )}
      {decision.isError ? (
        <p role="alert">
          {errorMessage(decision.error)} Refresh the dossier before changing a stale decision.
        </p>
      ) : null}
      {decision.isSuccess ? <p role="status">Decision recorded by server.</p> : null}
    </div>
  );
}
