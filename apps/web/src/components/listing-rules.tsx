'use client';
import { useState } from 'react';
import { ApiFailure } from '@hsm/api-client';
import type { PrivateListingRule } from '@hsm/contracts';
import { errorMessage } from '../lib/messages';
import { inventoryScopeDenied } from './use-branch-inventory';
import { useListingRules } from './use-listing-rules';
import { ListingRuleEditor, type RuleDraft } from './listing-rule-editor';
import { Button } from './ui/button';
type Props = { actorId: string; branchId: string };
export function ListingRules(props: Props) {
  return <Rules key={props.actorId + ':' + props.branchId} {...props} />;
}
function Rules({ actorId, branchId }: Props) {
  const [open, setOpen] = useState(false),
    [state, setState] = useState<'active' | 'archived'>('active'),
    [cursor, setCursor] = useState<string>();
  const [draft, setDraft] = useState<RuleDraft>(),
    [saved, setSaved] = useState(false);
  const { query, current, mutation, clearKeys } = useListingRules(
    actorId,
    branchId,
    state,
    cursor,
    open,
    () => {
      setDraft(undefined);
      setSaved(true);
    },
  );
  const denied = [query.error, current.error, mutation.error].find(
    (error) =>
      inventoryScopeDenied(error) || (error instanceof ApiFailure && error.code === 'NOT_FOUND'),
  );
  const conflict =
    mutation.error instanceof ApiFailure && mutation.error.code === 'PRECONDITION_FAILED';
  const busy = mutation.isPending || current.isPending;
  const writable = query.isSuccess && !query.isFetching && query.data.canEdit && !denied;
  function cancel() {
    if (busy) return;
    setDraft(undefined);
    current.reset();
    mutation.reset();
    clearKeys();
  }
  function edit(row: PrivateListingRule, kind: 'edit' | 'archive') {
    setSaved(false);
    current.reset();
    mutation.reset();
    clearKeys();
    current.mutate(row.id, {
      onSuccess: (result) => {
        if (!result.canEdit || result.archivedAt !== null) return;
        setDraft({ kind, row: result });
      },
    });
  }
  function reload() {
    if (!draft || draft.kind === 'create' || busy) return;
    const kind = draft.kind;
    current.mutate(draft.row.id, {
      onSuccess: (result) => {
        mutation.reset();
        clearKeys();
        if (!result.canEdit || result.archivedAt !== null) {
          setDraft(undefined);
          void query.refetch();
          return;
        }
        setDraft({ kind, row: result });
      },
    });
  }
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View hostel rules
      </Button>
    );
  if (denied)
    return (
      <section aria-label="Manage hostel rules">
        <p role="alert">{errorMessage(denied)}</p>
        <Button
          variant="secondary"
          disabled={query.isFetching || busy}
          onClick={() => {
            void query.refetch().then((result) => {
              if (result.isSuccess) {
                cancel();
              }
            });
          }}
        >
          Retry hostel rule access
        </Button>
      </section>
    );
  return (
    <section aria-label="Manage hostel rules" className="space-y-4">
      <h2 className="text-xl font-semibold">Hostel rules</h2>
      {query.isPending ? <p role="status">Loading hostel rules…</p> : null}
      {query.isError ? <p role="alert">{errorMessage(query.error)}</p> : null}
      {current.isError ? <p role="alert">{errorMessage(current.error)}</p> : null}
      {mutation.isError ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {saved ? <p role="status">Hostel rule saved. Current rules are being refreshed.</p> : null}
      {current.isPending ? <p role="status">Loading current rule…</p> : null}
      {query.isSuccess && !query.isError ? (
        <>
          <p>{state === 'active' ? 'Published informational rules' : 'Archived rule history'}</p>
          {!query.data.canEdit ? <p>Editing hostel rules requires a listing grant.</p> : null}
          {!query.data.data.length ? (
            <p>
              {state === 'active'
                ? 'No hostel rules have been added.'
                : 'No archived hostel rules.'}
            </p>
          ) : null}
          <ul className="space-y-4">
            {query.data.data.map((row) => (
              <li key={row.id} className="space-y-2">
                <p className="whitespace-pre-wrap break-words">{row.body}</p>
                <p>Display order: {row.sortOrder}</p>
                {state === 'active' && writable && !draft ? (
                  <>
                    <Button variant="secondary" disabled={busy} onClick={() => edit(row, 'edit')}>
                      Edit this rule
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => edit(row, 'archive')}
                    >
                      Archive this rule
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          {writable && state === 'active' && !draft ? (
            <Button
              disabled={busy}
              onClick={() => {
                setSaved(false);
                setDraft({ kind: 'create' });
              }}
            >
              Add hostel rule
            </Button>
          ) : null}
        </>
      ) : null}
      {draft ? (
        <ListingRuleEditor
          key={
            draft.kind === 'create'
              ? 'create'
              : draft.kind + ':' + draft.row.id + ':' + draft.row.version
          }
          draft={draft}
          disabled={!writable || conflict || current.isError}
          busy={busy}
          submit={(command) => mutation.mutate(command)}
          cancel={cancel}
        />
      ) : null}
      {conflict && draft?.kind !== 'create' ? (
        <Button variant="secondary" disabled={busy} onClick={reload}>
          Reload current hostel rule
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={busy || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh current hostel rules
      </Button>
      {!draft ? (
        <nav aria-label="Hostel rule pages" className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setState(state === 'active' ? 'archived' : 'active');
              setCursor(undefined);
              setSaved(false);
            }}
          >
            {state === 'active' ? 'View archived rules' : 'View active rules'}
          </Button>
          {query.data?.nextCursor ? (
            <Button
              variant="secondary"
              disabled={busy || query.isFetching}
              onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
            >
              Next hostel rules
            </Button>
          ) : null}
          {cursor ? (
            <Button variant="secondary" disabled={busy} onClick={() => setCursor(undefined)}>
              Back to first rules page
            </Button>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
