'use client';
import { useEffect, useRef, useState } from 'react';
import { listOwnerManagers, ownerCredentialForm, type OwnerSetupActions } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { OwnerChoice } from './owner-choice';
import { FlowForm } from './auth/flow-form';
import { Button } from './ui/button';
export function OwnerManagerReset({
  userId,
  branchId,
  actions,
}: {
  userId: string;
  branchId: string;
  actions: OwnerSetupActions;
}) {
  const [open, setOpen] = useState(false),
    [assignment, setAssignment] = useState<{ id: string; name: string }>(),
    [manual, setManual] = useState(false),
    [credential, setCredential] = useState<string>();
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
      actions.forgetInvitationReset(branchId);
    },
    [actions, branchId],
  );
  function forget() {
    generation.current += 1;
    actions.forgetInvitationReset(branchId);
    setCredential(undefined);
  }
  function clear() {
    forget();
    setAssignment(undefined);
    setCredential(undefined);
    setManual(false);
  }
  return (
    <section className="space-y-4" aria-label="Pending Manager invitation recovery">
      <Button
        variant="secondary"
        onClick={() => {
          clear();
          setOpen((value) => !value);
        }}
      >
        {open ? 'Close invitation recovery' : 'Reset a pending invitation'}
      </Button>
      {open ? (
        <>
          <p>
            Only pending invitations without a permanent password can receive a replacement
            temporary credential. This cannot reset an existing account password.
          </p>
          <OwnerChoice
            label="Pending Manager invitations"
            queryKey={['owner-pending-managers', userId, branchId]}
            choose={(value) => {
              forget();
              setAssignment(value);
              setCredential(undefined);
            }}
            selectedId={assignment?.id}
            load={async (cursor) => {
              const page = await listOwnerManagers(browserClient(), branchId, {
                limit: 20,
                ...(cursor ? { cursor } : {}),
              });
              return {
                data: page.data
                  .filter((row) => row.status === 'pending_activation')
                  .map((row) => ({ id: row.id, name: row.fullName })),
                nextCursor: page.nextCursor,
              };
            }}
          />
          {assignment ? (
            <>
              <p>Selected invitation: {assignment.name}</p>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={manual}
                  onChange={(event) => {
                    forget();
                    setManual(event.target.checked);
                    setCredential(undefined);
                  }}
                />
                Set replacement password manually
              </label>
              <FlowForm
                key={assignment.id + ':' + String(manual)}
                label="Replace temporary credential"
                fields={
                  manual
                    ? [
                        {
                          name: 'temporaryPassword',
                          label: 'Replacement temporary password',
                          type: 'password',
                          autoComplete: 'new-password',
                        },
                      ]
                    : []
                }
                submit={async (values) => {
                  setCredential(undefined);
                  const ticket = generation.current;
                  const result = await actions.resetInvitation(
                    branchId,
                    assignment.id,
                    ownerCredentialForm(values, manual),
                  );
                  if (ticket !== generation.current) return '';
                  setCredential(result.generatedTempPassword);
                  return result.generatedTempPassword
                    ? 'Share this replacement privately. It is shown only for this response.'
                    : 'The invitation credential was reset. A replay cannot recover an automatic password; request another replacement if needed.';
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
      {credential ? (
        <div className="space-y-3">
          <p>
            Replacement temporary password: <span>{credential}</span>
          </p>
          <Button variant="secondary" onClick={() => setCredential(undefined)}>
            Hide replacement password
          </Button>
        </div>
      ) : null}
    </section>
  );
}
