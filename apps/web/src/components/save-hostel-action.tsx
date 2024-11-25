'use client';
import Link from 'next/link';
import { useSession } from './providers';
import { useSavedMutation } from './use-saved-hostels';
import { inventoryScopeDenied } from './use-branch-inventory';
import { MarketplaceButton as Button } from './ui/marketplace-button';
import { errorMessage } from '../lib/messages';
import { authenticationPath, customerProfilePath } from '../lib/return-path';
export function SaveHostelAction({ branchId }: { branchId: string }) {
  const session = useSession(),
    returnTo = '/hostels/' + branchId;
  if (session.isPending) return <p role="status">Checking Saved access…</p>;
  if (!session.data || session.error)
    return (
      <Link className="text-link" href={authenticationPath('login', returnTo)}>
        Sign in to save this hostel
      </Link>
    );
  if (!session.data.capabilities.customer)
    return (
      <Link className="text-link" href={customerProfilePath(returnTo)}>
        Complete your Customer profile to save hostels
      </Link>
    );
  return (
    <SaveAction
      key={session.data.user.id + ':' + branchId}
      actorId={session.data.user.id}
      branchId={branchId}
    />
  );
}
function SaveAction({ actorId, branchId }: { actorId: string; branchId: string }) {
  const mutation = useSavedMutation(actorId);
  if (inventoryScopeDenied(mutation.error))
    return <p role="alert">{errorMessage(mutation.error)}</p>;
  return (
    <div className="space-y-2">
      <Button
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ branchId, saved: true })}
      >
        {mutation.isPending ? 'Saving hostel…' : 'Save this hostel'}
      </Button>
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {mutation.isSuccess ? (
        <p role="status">
          Hostel saved by the server.{' '}
          <Link className="text-link" href="/app/customer">
            View Saved hostels
          </Link>
        </p>
      ) : null}
    </div>
  );
}
