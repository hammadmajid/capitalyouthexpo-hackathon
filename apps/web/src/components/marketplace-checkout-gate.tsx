'use client';
import Link from 'next/link';
import type { BookingQuoteSnapshot } from '@hsm/contracts';
import { authenticationPath, customerProfilePath } from '../lib/return-path';
import { useSession } from './providers';
import { inventoryScopeDenied } from './use-branch-inventory';
import { MarketplaceCheckout } from './marketplace-checkout';
import { MarketplaceButton as Button } from './ui/marketplace-button';
export function MarketplaceCheckoutGate(props: {
  branchId: string;
  quote: BookingQuoteSnapshot;
  onBusy?: ((busy: boolean) => void) | undefined;
}) {
  const session = useSession(),
    returnTo = '/hostels/' + props.branchId;
  if (session.isPending) return <p role="status">Checking booking access…</p>;
  if (!session.data || inventoryScopeDenied(session.error))
    return (
      <Link className="text-link" href={authenticationPath('login', returnTo)}>
        Sign in to book this hostel
      </Link>
    );
  if (!session.data.user.emailVerified)
    return (
      <Link className="text-link" href="/app/security">
        Verify your email before booking
      </Link>
    );
  if (!session.data.capabilities.customer)
    return (
      <Link className="text-link" href={customerProfilePath(returnTo)}>
        Complete your Customer profile to book
      </Link>
    );
  return (
    <div className="space-y-3">
      {session.error ? (
        <>
          <p role="alert">
            Booking access could not refresh. Your draft is retained; retry before submitting.
          </p>
          <Button
            variant="secondary"
            disabled={session.isFetching}
            onClick={() => void session.refetch()}
          >
            Retry booking access
          </Button>
        </>
      ) : null}
      <MarketplaceCheckout
        {...props}
        actorId={session.data.user.id}
        accessUnavailable={Boolean(session.error) || session.isFetching}
      />
    </div>
  );
}
