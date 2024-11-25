'use client';
import { useEffect, useRef, useState } from 'react';
import { ownerInvitationForm, type OwnerSetupActions } from '@hsm/api-client';
import { FlowForm } from './auth/flow-form';
import { Button } from './ui/button';
export function OwnerInvitation({
  branchId,
  actions,
}: {
  branchId: string;
  actions: OwnerSetupActions;
}) {
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
      actions.forgetInvitation(branchId);
    },
    [actions, branchId],
  );
  function forget() {
    generation.current += 1;
    actions.forgetInvitation(branchId);
  }

  const [inviting, setInviting] = useState(false),
    [manual, setManual] = useState(false);
  const [credential, setCredential] = useState<string>(),
    [notice, setNotice] = useState<string>();
  return (
    <section className="space-y-4" aria-label="Branch management">
      <h3 className="text-xl font-semibold">Who manages this branch?</h3>
      <p>
        You can manage your own branch. A separate Manager is optional and does not replace your
        Owner access.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          forget();
          setInviting((value) => !value);
          setCredential(undefined);
          setNotice(undefined);
        }}
      >
        {' '}
        {inviting ? 'I will manage this branch' : 'Invite a Manager'}{' '}
      </Button>
      {inviting ? (
        <>
          <p>
            The Manager must establish a permanent password. Phone format is checked; phone
            ownership is not verified.
          </p>
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
            Set a temporary password manually
          </label>
          <FlowForm
            key={manual ? 'manual' : 'auto'}
            label="Send Manager invitation"
            fields={[
              { name: 'managerName', label: 'Manager full name' },
              { name: 'managerPhone', label: 'Manager mobile number', type: 'tel' },
              ...(manual
                ? [
                    {
                      name: 'temporaryPassword',
                      label: 'Temporary password',
                      type: 'password',
                      autoComplete: 'new-password',
                    },
                  ]
                : []),
            ]}
            submit={async (input) => {
              setCredential(undefined);
              setNotice(undefined);
              const ticket = generation.current;
              const result = await actions.invite(branchId, ownerInvitationForm(input, manual));
              if (ticket !== generation.current) return;
              setCredential(result.generatedTempPassword);
              setNotice(
                result.acceptance === 'authenticated_account'
                  ? 'This existing account must sign in and accept the invitation. Its password is unchanged.'
                  : result.generatedTempPassword
                    ? 'Share the temporary credential privately. It is shown only for this response.'
                    : 'Invitation is pending. A manual credential is never returned; an automatic credential cannot be recovered from a replay.',
              );
            }}
          />
        </>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {credential ? (
        <div className="space-y-3">
          <p>
            Temporary password: <span>{credential}</span>
          </p>
          <Button variant="secondary" onClick={() => setCredential(undefined)}>
            Hide temporary password
          </Button>
        </div>
      ) : null}
    </section>
  );
}
