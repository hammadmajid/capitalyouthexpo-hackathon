'use client';
import { useState } from 'react';
import type { listAdmins } from '@hsm/api-client';
import { Button } from '../ui/button';
type Account = Awaited<ReturnType<typeof listAdmins>>['data'][number];
type Change =
  | { change: 'status'; status: string }
  | { change: 'roles'; roles: string[] }
  | { change: 'root'; isRoot: boolean };
export function AdminAccountControls({
  row,
  actorId,
  locked,
  save,
}: {
  row: Account;
  actorId: string;
  locked: boolean;
  save: (input: Record<string, unknown>, complete: () => void) => void;
}) {
  const [change, setChange] = useState<Change>(),
    [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState(false);
  if (row.userId === actorId)
    return <p>Your current administrative session is protected from self-modification.</p>;
  function select(value: Change) {
    setChange(value);
    setReason('');
    setConfirm(false);
  }
  return (
    <div className="space-y-3">
      {change ? (
        <>
          <p>
            Review {row.fullName}:{' '}
            {change.change === 'status'
              ? change.status
              : change.change === 'root'
                ? change.isRoot
                  ? 'Grant Root membership'
                  : 'Remove Root membership'
                : 'Change Normal Admin roles'}
          </p>
          {change.change === 'roles' ? (
            <fieldset disabled={locked || confirm}>
              <legend>Normal Admin permissions</legend>
              {['verification', 'support', 'content_moderator'].map((role) => (
                <label key={role} className="mr-4 inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={change.roles.includes(role)}
                    onChange={(event) =>
                      setChange({
                        change: 'roles',
                        roles: event.target.checked
                          ? [...change.roles, role]
                          : change.roles.filter((r) => r !== role),
                      })
                    }
                  />
                  {role.replaceAll('_', ' ')}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="field-label">
            Change reason
            <textarea
              aria-label={'Admin change reason for ' + row.fullName}
              className="field-input"
              maxLength={500}
              disabled={locked || confirm}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {confirm ? (
            <>
              <p>
                Confirm this privileged action: {reason}. Membership and permission changes are
                audited; restrictions can end existing access.
              </p>
              <Button
                disabled={locked}
                onClick={() =>
                  save({ ...change, reason: reason.trim() }, () => {
                    setChange(undefined);
                    setConfirm(false);
                  })
                }
              >
                Confirm admin change
              </Button>
            </>
          ) : (
            <Button
              disabled={
                locked ||
                reason.trim().length < 8 ||
                (change.change === 'roles' && !change.roles.length)
              }
              onClick={() => setConfirm(true)}
            >
              Review admin change
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={locked}
            onClick={() => {
              setChange(undefined);
              setConfirm(false);
            }}
          >
            Cancel admin change
          </Button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {row.status === 'active' ? (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => select({ change: 'status', status: 'suspended' })}
            >
              Suspend {row.fullName}
            </Button>
          ) : null}
          {row.status === 'suspended' ? (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => select({ change: 'status', status: 'active' })}
            >
              Reinstate {row.fullName}
            </Button>
          ) : null}
          {row.status !== 'deactivated' ? (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => select({ change: 'status', status: 'deactivated' })}
            >
              Deactivate {row.fullName}
            </Button>
          ) : null}
          {!row.isRoot ? (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => select({ change: 'roles', roles: [...row.roles] })}
            >
              Edit roles for {row.fullName}
            </Button>
          ) : null}
          {row.status === 'active' ? (
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => select({ change: 'root', isRoot: !row.isRoot })}
            >
              {row.isRoot ? 'Remove Root from ' : 'Grant Root to '}
              {row.fullName}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
