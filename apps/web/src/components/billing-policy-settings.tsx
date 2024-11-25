'use client';
import { useState, type FormEvent } from 'react';
import type { BillingSettingsTarget } from '@hsm/contracts';
import { billingDraftFrom, type BillingDraft } from '../lib/billing-policy-draft';
import { billingPolicyFromDraft } from '../lib/billing-policy-input';
import { errorMessage } from '../lib/messages';
import { useBillingPolicy } from './use-billing-policy';
import { TransportBillingPolicyForm } from './transport-billing-policy';
import { BillingPolicyEditor } from './billing-policy-editor';
import { BillingPolicySummary } from './billing-policy-summary';
import { Button } from './ui/button';
import { useInventoryNavigationLock } from './inventory-navigation';
type Props = {
  actorId: string;
  target: BillingSettingsTarget;
  accessUnavailable?: boolean;
  roomTypeName?: string;
};
type Edit = { draft: BillingDraft; base: string | null };
export function BillingPolicySettings(props: Props) {
  return (
    <Settings
      key={
        props.actorId + ':' + props.target.branchId + ':' + (props.target.roomTypeId ?? 'branch')
      }
      {...props}
    />
  );
}
function Settings({ actorId, target, accessUnavailable = false, roomTypeName }: Props) {
  const [open, setOpen] = useState(false),
    [edit, setEdit] = useState<Edit>(),
    [validation, setValidation] = useState(''),
    [saved, setSaved] = useState(false);
  const { query, mutation } = useBillingPolicy(actorId, target, open, accessUnavailable, () => {
    setEdit(undefined);
    setValidation('');
    setSaved(true);
  });
  useInventoryNavigationLock(open || mutation.isPending);
  const title = roomTypeName ? 'Billing policy for ' + roomTypeName : 'Billing policy';
  const error = query.error ?? mutation.error,
    busy = mutation.isPending || query.isFetching,
    current =
      !accessUnavailable && !query.isPending && !query.isFetching && !error
        ? query.data
        : undefined;
  const conflict = Boolean(edit && current && edit.base !== (current.effectiveVersion?.id ?? null));
  function start() {
    if (!current?.canEdit || busy) return;
    setEdit({
      draft: billingDraftFrom(current.effectiveVersion?.policy),
      base: current.effectiveVersion?.id ?? null,
    });
    setValidation('');
    setSaved(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!edit || !current?.canEdit || busy || conflict) return;
    setValidation('');
    setSaved(false);
    try {
      mutation.mutate(billingPolicyFromDraft(edit.draft));
    } catch {
      setValidation(
        'Complete all required settings with supported values. Enter exact PKR amounts and whole numbers of days.',
      );
    }
  }
  if (!open)
    return (
      <Button variant="secondary" disabled={accessUnavailable} onClick={() => setOpen(true)}>
        {roomTypeName ? `View billing policy for ${roomTypeName}` : 'View billing policy'}
      </Button>
    );
  return (
    <section aria-label={title} className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <Button
        variant="ghost"
        disabled={mutation.isPending}
        onClick={() => {
          setOpen(false);
          setEdit(undefined);
          setValidation('');
          setSaved(false);
          mutation.reset();
        }}
      >
        {roomTypeName ? `Close billing policy for ${roomTypeName}` : 'Close billing policy'}
      </Button>
      {saved ? <p role="status">Billing policy version saved.</p> : null}
      {accessUnavailable ? (
        <p role="alert">Refresh branch access before viewing billing settings.</p>
      ) : error ? (
        <div>
          <p role="alert">{errorMessage(error)}</p>
          <Button
            disabled={busy}
            onClick={() => {
              mutation.reset();
              setSaved(false);
              void query.refetch();
            }}
          >
            Retry billing policy
          </Button>
        </div>
      ) : !current ? (
        <p role="status">Loading billing policy…</p>
      ) : (
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setSaved(false);
              void query.refetch();
            }}
          >
            Refresh billing policy
          </Button>
          {current.effectiveVersion ? (
            <>
              <p>Effective source: {current.effectiveVersion.level.replaceAll('_', ' ')}</p>
              <BillingPolicySummary policy={current.effectiveVersion.policy} />
            </>
          ) : (
            <p>
              No billing policy is configured. Financial posting requires explicit agreed terms.
            </p>
          )}
          {!edit &&
          target.roomTypeId === undefined &&
          current.effectiveVersion &&
          (current.canEditTransport || current.effectiveVersion.policy.transportBilling) ? (
            <TransportBillingPolicyForm
              key={current.effectiveVersion.id}
              actorId={actorId}
              branchId={target.branchId}
              version={current.effectiveVersion.id}
              policy={current.effectiveVersion.policy.transportBilling}
              canEdit={current.canEditTransport === true}
            />
          ) : null}
          {!current.canEdit ? (
            <p>Read only. Only the owning Owner can save billing policy versions.</p>
          ) : null}
          {conflict ? (
            <div>
              <p role="alert">
                Billing settings changed. Your draft is retained. Reload current values before
                saving a new version.
              </p>
              <Button disabled={busy} onClick={start}>
                Reload current billing values
              </Button>
            </div>
          ) : null}
          {edit && current.canEdit ? (
            <BillingPolicyEditor
              draft={edit.draft}
              setDraft={(draft) => setEdit({ ...edit, draft })}
              disabled={busy || conflict}
              submit={submit}
              cancel={() => {
                setEdit(undefined);
                setValidation('');
              }}
              error={validation}
            />
          ) : current.canEdit ? (
            <Button disabled={busy} onClick={start}>
              Edit billing policy
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
