'use client';
import { errorMessage } from '../../lib/messages';
import { CommandRecovery } from '../services/command-recovery';
import { Button } from '../ui/button';
import { changedFields } from './revision-fields';
import type { useHostelRevision } from './use-hostel-revision';
type Revision = ReturnType<typeof useHostelRevision>;
function Heading({ revision }: { revision: Revision }) {
  const { open, revision: last } = revision;
  if (open?.status === 'submitted')
    return (
      <>
        <h4 className="font-semibold">Waiting for HSM review</h4>
        <p>Your hostel stays live with its current details until approved.</p>
      </>
    );
  if (open)
    return (
      <>
        <h4 className="font-semibold">Unsent changes</h4>
        <p>Customers still see the approved details.</p>
      </>
    );
  if (last?.status === 'rejected')
    return (
      <>
        <h4 className="font-semibold">Last changes not approved</h4>
        {last.decisionNote ? <p>{last.decisionNote}</p> : null}
        <p>Edit Basic Information or Location to try again.</p>
      </>
    );
  return (
    <>
      <h4 className="font-semibold">
        {last?.status === 'approved' ? 'Changes approved' : 'Hostel is live'}
      </h4>
      <p>Edit Basic Information or Location, then send the changes for re-verification.</p>
    </>
  );
}
// CHG-041: the approved hostel stays live; edits wait here until HSM approves them.
export function OwnerRevisionPanel({ revision }: { revision: Revision }) {
  const { query, command, open } = revision;
  if (query.isError) return <p role="alert">{errorMessage(query.error)}</p>;
  if (!query.data) return <p role="status">Loading your changes…</p>;
  const busy = command.isPending || command.unresolved,
    changes = open ? changedFields(query.data.live, open) : [];
  return (
    <section
      aria-label="Hostel changes"
      className="space-y-2 rounded-input border border-hsm-border p-4"
    >
      <Heading revision={revision} />
      {changes.length ? <p>Changed: {changes.join(', ')}</p> : null}
      {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
      <CommandRecovery command={command} />
      <div className="flex flex-wrap gap-2">
        {open?.status === 'draft' ? (
          <Button
            disabled={busy || !changes.length}
            onClick={() => command.mutate({ kind: 'submit', expectedVersion: open.version })}
          >
            {command.isPending ? 'Sending…' : 'Send for re-verification'}
          </Button>
        ) : null}
        {open ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => command.mutate({ kind: 'withdraw', expectedVersion: open.version })}
          >
            {open.status === 'submitted' ? 'Withdraw changes' : 'Discard changes'}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
