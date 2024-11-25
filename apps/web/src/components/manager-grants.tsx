'use client';
import { useInventoryNavigationLock } from './inventory-navigation';
import { useState } from 'react';
import { ApiFailure } from '@hsm/api-client';
import type { InventoryPermission } from '@hsm/contracts';
import { useManagerChoices, useManagerGrants } from './use-manager-grants';
import { ManagerGrantsForm } from './manager-grants-form';
import { inventoryScopeDenied } from './use-branch-inventory';
import { Button } from './ui/button';
import { errorMessage } from '../lib/messages';
const denied = (error: unknown) =>
  inventoryScopeDenied(error) || (error instanceof ApiFailure && error.code === 'NOT_FOUND');
const snapshot = (values: InventoryPermission[]) => JSON.stringify([...values].sort());
export function ManagerGrants(props: { actorId: string; branchId: string }) {
  return <Choices key={props.actorId + ':' + props.branchId} {...props} />;
}
function Choices({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<string>();
  const query = useManagerChoices(actorId, branchId, open);
  useInventoryNavigationLock(open && Boolean(query.data) && !denied(query.error));
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Configure Manager permissions
      </Button>
    );
  if (denied(query.error))
    return (
      <section aria-label="Manager permissions">
        <p role="alert">{errorMessage(query.error)}</p>
        <Button
          onClick={() => {
            setSelected(undefined);
            void query.refetch();
          }}
        >
          Retry Manager access
        </Button>
      </section>
    );
  const managers = query.data?.pages.flatMap((page) => page.data) ?? [],
    manager = managers.find((row) => row.id === selected);
  return (
    <section aria-label="Manager permissions" className="space-y-4">
      <h2 className="text-xl font-semibold">Manager permissions</h2>
      {query.isPending ? <p role="status">Loading assigned Managers…</p> : null}
      {query.error ? (
        <>
          <p role="alert">
            Manager assignments could not refresh. Changes are disabled until access is verified.
          </p>
          <Button disabled={query.isFetching} onClick={() => void query.refetch()}>
            Retry Manager assignments
          </Button>
        </>
      ) : null}
      {!query.isPending && !query.error && !managers.length ? (
        <p>No Managers have been assigned to this branch.</p>
      ) : null}
      <ul className="space-y-3">
        {managers.map((row) => (
          <li key={row.id}>
            <Button
              variant="secondary"
              disabled={query.isFetching || Boolean(query.error)}
              onClick={() => setSelected(row.id)}
            >
              Permissions for {row.fullName || 'Unnamed Manager'} ({row.status})
            </Button>
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <Button disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>
          Load more Managers
        </Button>
      ) : null}
      {selected && !manager && !query.isPending && !query.error ? (
        <p role="alert">
          This assignment is no longer available. Select a current Manager to continue.
        </p>
      ) : null}
      {manager ? (
        <Assignment
          key={actorId + ':' + branchId + ':' + manager.id}
          actorId={actorId}
          branchId={branchId}
          assignmentId={manager.id}
          name={manager.fullName || 'Unnamed Manager'}
          unavailable={query.isFetching || Boolean(query.error)}
        />
      ) : null}
    </section>
  );
}
function Assignment({
  actorId,
  branchId,
  assignmentId,
  name,
  unavailable,
}: {
  actorId: string;
  branchId: string;
  assignmentId: string;
  name: string;
  unavailable: boolean;
}) {
  const [draft, setDraft] = useState<InventoryPermission[]>(),
    [saved, setSaved] = useState(false);
  const { query, mutation } = useManagerGrants(actorId, branchId, assignmentId, () => {
    setDraft(undefined);
    setSaved(true);
  });
  const rejection = [query.error, mutation.error].find(denied);
  if (rejection)
    return (
      <div>
        <p role="alert">{errorMessage(rejection)}</p>
        <Button
          onClick={() => {
            setDraft(undefined);
            mutation.reset();
            void query.refetch();
          }}
        >
          Retry assignment access
        </Button>
      </div>
    );
  if (query.isPending) return <p role="status">Loading saved permissions…</p>;
  const current = query.data;
  if (!current)
    return (
      <div>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button onClick={() => void query.refetch()}>Retry saved permissions</Button>
      </div>
    );
  const conflict = draft !== undefined && snapshot(draft) !== snapshot(current.permissions);
  const disabled = unavailable || query.isFetching || Boolean(query.error) || mutation.isPending;
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Permissions for {name}</h3>
      {saved ? <p role="status">Manager permission changes saved.</p> : null}
      {query.error ? (
        <p role="alert">
          Saved permissions could not refresh. Your draft is retained; retry before saving.
        </p>
      ) : null}
      {query.error ? (
        <Button onClick={() => void query.refetch()}>Retry saved permissions</Button>
      ) : null}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {conflict ? (
        <>
          <p role="alert">
            Saved permissions changed. Your draft is retained. Reload current values before saving.
          </p>
          <Button
            disabled={disabled}
            onClick={() => {
              setDraft(current.permissions);
              mutation.reset();
            }}
          >
            Reload current permissions
          </Button>
        </>
      ) : null}
      {draft ? (
        <ManagerGrantsForm
          key={snapshot(draft)}
          initial={draft}
          disabled={disabled || conflict}
          onSave={(permissions) => mutation.mutate(permissions)}
          onCancel={() => {
            setDraft(undefined);
            mutation.reset();
          }}
        />
      ) : (
        <>
          <p>{current.permissions.length} additional permissions are currently configured.</p>
          <Button
            disabled={disabled}
            onClick={() => {
              setDraft(current.permissions);
              setSaved(false);
              mutation.reset();
            }}
          >
            Edit Manager permissions
          </Button>
        </>
      )}
    </div>
  );
}
