'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listOwnerManagers, removeOwnerManager } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { FlowForm } from '../auth/flow-form';
import { OwnerChoice } from '../owner-choice';
import { Button } from '../ui/button';
type Assignment = { id: string; name: string; pending: boolean };
// AUTH-M-006 / MGR-004: removing a Manager (or cancelling an invitation) ends that assignment
// for good. The Owner confirms with their own password; the server checks it and audits it.
export function OwnerManagerRemove({ userId, branchId }: { userId: string; branchId: string }) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false),
    [assignment, setAssignment] = useState<Assignment>(),
    [done, setDone] = useState<string>();
  const listKey = ['owner-removable-managers', userId, branchId],
    pending = useRef(new Set<string>());
  return (
    <section className="space-y-3" aria-label="Remove a Manager">
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(!open);
          setAssignment(undefined);
          setDone(undefined);
        }}
      >
        {open ? 'Close Manager removal' : 'Remove a Manager'}
      </Button>
      {done ? <p role="status">{done}</p> : null}
      {open ? (
        <OwnerChoice
          label="Managers of this branch"
          queryKey={listKey}
          selectedId={assignment?.id}
          choose={(value) => {
            setDone(undefined);
            setAssignment({ ...value, pending: pending.current.has(value.id) });
          }}
          load={async (cursor) => {
            const page = await listOwnerManagers(browserClient(), branchId, {
              limit: 20,
              ...(cursor ? { cursor } : {}),
            });
            const rows = page.data.filter((row) => row.status !== 'deactivated');
            for (const row of rows)
              if (row.status === 'pending_activation') pending.current.add(row.id);
            return {
              data: rows.map((row) => ({
                id: row.id,
                name: row.fullName + (row.status === 'pending_activation' ? ' · invited' : ''),
              })),
              nextCursor: page.nextCursor,
            };
          }}
        />
      ) : null}
      {open && assignment ? (
        <div className="space-y-2 rounded-input border border-hsm-border p-3">
          <p>
            {assignment.pending
              ? 'Cancel this invitation? It cannot be undone.'
              : 'Remove ' + assignment.name + '? Their access ends now and cannot be undone.'}
          </p>
          <FlowForm
            key={assignment.id}
            label={assignment.pending ? 'Yes, cancel invitation' : 'Yes, remove Manager'}
            fields={[{ name: 'currentPassword', label: 'Your password', type: 'password' }]}
            submit={async (values) => {
              await removeOwnerManager(
                browserClient(),
                branchId,
                assignment.id,
                values.currentPassword ?? '',
              );
              setDone(
                assignment.name + (assignment.pending ? ' invitation cancelled.' : ' removed.'),
              );
              setAssignment(undefined);
              await cache.invalidateQueries({ queryKey: listKey });
              return '';
            }}
          />
          <Button variant="ghost" onClick={() => setAssignment(undefined)}>
            No, keep
          </Button>
        </div>
      ) : null}
    </section>
  );
}
