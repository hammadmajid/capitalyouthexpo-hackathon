'use client';
import { useState, type FormEvent } from 'react';
import {
  billingCatalogInputSchema,
  billingCatalogArchiveSchema,
  type BillingCatalogEntry,
} from '@hsm/contracts';
import { inventoryPaisa, inventoryRupees } from '../lib/inventory-money';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { CatalogCreateForm, CatalogArchiveForm, emptyCatalogDraft } from './billing-catalog-forms';
import { useBillingCatalog } from './use-billing-catalog';
type Props = { actorId: string; branchId: string; accessUnavailable?: boolean };
export function BillingCatalog(props: Props) {
  return <Catalog key={props.actorId + ':' + props.branchId} {...props} />;
}
function Catalog({ actorId, branchId, accessUnavailable = false }: Props) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [history, setHistory] = useState(false),
    [draft, setDraft] = useState({ ...emptyCatalogDraft }),
    [target, setTarget] = useState<BillingCatalogEntry>(),
    [reason, setReason] = useState(''),
    [validation, setValidation] = useState(''),
    [notice, setNotice] = useState('');
  const { query, mutation } = useBillingCatalog(
    actorId,
    branchId,
    open,
    accessUnavailable,
    cursor,
    history,
    (action) => {
      setValidation('');
      setNotice(
        action.kind === 'create' ? 'Approved charge created.' : 'Approved charge archived.',
      );
      setDraft({ ...emptyCatalogDraft });
      setTarget(undefined);
      setReason('');
    },
  );
  const busy = mutation.isPending || query.isFetching,
    error = query.error ?? mutation.error;
  const current =
    !accessUnavailable && !query.isPending && !query.isFetching && !error ? query.data : undefined;
  function create(event: FormEvent) {
    event.preventDefault();
    if (!current?.canEdit || busy) return;
    setNotice('');
    setValidation('');
    try {
      const input = billingCatalogInputSchema.parse({
        code: draft.code,
        name: draft.name,
        unitLabel: draft.unitLabel,
        unitAmountPaisa: inventoryPaisa(draft.price),
      });
      mutation.mutate({ kind: 'create', input });
    } catch {
      setValidation('Enter a valid charge code, name, unit and positive PKR price.');
    }
  }
  function archive(event: FormEvent) {
    event.preventDefault();
    if (!current?.canEdit || busy || !target) return;
    setNotice('');
    setValidation('');
    const input = billingCatalogArchiveSchema.safeParse({ reason });
    if (!input.success) {
      setValidation('Enter a reason before archiving this charge.');
      return;
    }
    mutation.mutate({ kind: 'archive', id: target.id, reason: input.data.reason });
  }
  if (!open)
    return (
      <Button variant="secondary" disabled={accessUnavailable} onClick={() => setOpen(true)}>
        Approved charges
      </Button>
    );
  return (
    <section aria-label="Approved charges" className="space-y-4">
      <h2 className="text-xl font-semibold">Approved charges</h2>
      <Button
        variant="ghost"
        disabled={mutation.isPending}
        onClick={() => {
          setOpen(false);
          setNotice('');
        }}
      >
        Close approved charges
      </Button>
      {notice ? <p role="status">{notice}</p> : null}
      {accessUnavailable ? (
        <p role="alert">Refresh branch access before viewing approved charges.</p>
      ) : error ? (
        <div>
          <p role="alert">{errorMessage(error)}</p>
          <Button
            disabled={busy}
            onClick={() => {
              mutation.reset();
              setNotice('');
              void query.refetch();
            }}
          >
            Retry approved charges
          </Button>
        </div>
      ) : !current ? (
        <p role="status">Loading approved charges…</p>
      ) : (
        <>
          <label className="field-label">
            <input
              type="checkbox"
              checked={history}
              disabled={busy}
              onChange={(event) => {
                setHistory(event.target.checked);
                setCursor(undefined);
                setTarget(undefined);
              }}
            />
            Include archived charges
          </label>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setNotice('');
              void query.refetch();
            }}
          >
            Refresh approved charges
          </Button>
          {!current.canEdit ? (
            <p>Read only. Only the owning Owner can create or archive approved charges.</p>
          ) : null}
          {!current.data.length ? (
            <p>No approved charges on this page.</p>
          ) : (
            <ul className="space-y-3">
              {current.data.map((entry) => (
                <li key={entry.id} className="rounded-card border border-hsm-border p-4">
                  <h3 className="font-semibold">{entry.name}</h3>
                  <p>{entry.code}</p>
                  <p>
                    Rs {inventoryRupees(entry.unitAmountPaisa)} per {entry.unitLabel}
                  </p>
                  {entry.archivedAt ? (
                    <p>Archived</p>
                  ) : current.canEdit ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setTarget(entry);
                        setReason('');
                        setValidation('');
                      }}
                    >
                      Archive {entry.name}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {current.nextCursor ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setTarget(undefined);
                setCursor(current.nextCursor ?? undefined);
              }}
            >
              Next approved charges
            </Button>
          ) : null}
          {cursor ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setTarget(undefined);
                setCursor(undefined);
              }}
            >
              First approved charges
            </Button>
          ) : null}
          {validation ? (
            <p role="alert" className="field-error">
              {validation}
            </p>
          ) : null}
          {current.canEdit ? (
            <CatalogCreateForm draft={draft} setDraft={setDraft} disabled={busy} submit={create} />
          ) : null}
          {current.canEdit && target ? (
            <CatalogArchiveForm
              name={target.name}
              reason={reason}
              setReason={setReason}
              disabled={busy}
              submit={archive}
              cancel={() => {
                setTarget(undefined);
                setReason('');
                setValidation('');
              }}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
