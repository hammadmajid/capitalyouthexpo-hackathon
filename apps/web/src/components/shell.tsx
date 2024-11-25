'use client';
import { OwnerDashboard } from './platform/dashboards';
import { AdminConsole } from './platform/admin-console';
import { OwnProfileReviews } from './platform/own-profile-reviews';
import { AdminInvitation, HelpSupport } from './platform/help-support';
import { StayDirectory } from './stay-directory';
import { SavedHostels } from './saved-hostels';
import { Visits } from './visits';
import { Waitlist } from './waitlist';
import { Chat } from './chat';
import { ChatSafety } from './chat-safety';
import { Inbox } from './inbox';
import { CustomerBookings } from './customer-bookings';
import { BookingPolicySettings } from './booking-policy-settings';
import { OwnerSetup } from './owner-setup';
import { EmailAssociation } from './email-association';
import { useEffect, useState, type ReactNode, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ArrowRight, LogOut, ShieldCheck, UserRound, KeyRound } from 'lucide-react';
import { z } from 'zod';
import { readApi, ApiFailure, ClientFailure, canAssociateEmail } from '@hsm/api-client';
import type { SelfProfile } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { canEnter, contexts, initialContext, type Context } from '../lib/capabilities';
import { errorMessage } from '../lib/messages';
import { authenticationPath } from '../lib/return-path';
import { useSession } from './providers';
import { Button } from './ui/button';
import { Branches } from './branches';
const labels: Record<Context, string> = {
  customer: 'Customer',
  resident: 'Resident',
  owner: 'Owner',
  manager: 'Manager',
  admin: 'Platform admin',
};
const icons = {
  customer: UserRound,
  resident: KeyRound,
  owner: Building2,
  manager: Building2,
  admin: ShieldCheck,
};
export function Shell({
  context,
  children,
  focused = false,
}: {
  context?: Context;
  children?: ReactNode;
  focused?: boolean;
}) {
  const session = useSession();
  const router = useRouter();
  const cache = useQueryClient();
  const [logoutError, setLogoutError] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  // A completed deliberate sign-out owns navigation; the expired-session guard must not race it
  // with a returnTo destination once /me starts answering 401.
  const signedOut = useRef(false);
  useEffect(() => {
    if (
      !signedOut.current &&
      session.error instanceof ApiFailure &&
      ['UNAUTHENTICATED', 'TOKEN_EXPIRED', 'SESSION_REVOKED', 'ACCOUNT_SUSPENDED'].includes(
        session.error.code,
      )
    ) {
      cache.clear();
      router.replace(authenticationPath('login', window.location.pathname));
    }
  }, [session.error, cache, router]);
  async function logout() {
    setLeaving(true);
    setLogoutError(undefined);
    try {
      await readApi(
        browserClient().POST('/v1/auth/logout', {}),
        z.object({ revoked: z.literal(true) }).strict(),
      );
      signedOut.current = true;
      cache.clear();
      router.replace('/login');
    } catch (error) {
      setLogoutError(errorMessage(error));
    } finally {
      setLeaving(false);
    }
  }
  if (session.isPending)
    return (
      <main id="main" className="p-10" aria-busy="true">
        <div
          className="customer-skeleton h-32 max-w-2xl"
          role="status"
          aria-label="Restoring your session"
        />
      </main>
    );
  if (session.error || !session.data)
    return (
      <main id="main" className="space-y-5 p-10">
        <h1 className="text-2xl font-bold">Your space is temporarily unavailable</h1>
        <p role="alert">{errorMessage(session.error)}</p>
        <Button onClick={() => void session.refetch()}>Try again</Button>
        <Link
          className="text-link ml-5"
          href={authenticationPath('login', window.location.pathname)}
        >
          Sign in
        </Link>
      </main>
    );
  const active = context ?? initialContext(session.data);
  return (
    <div
      className={
        active === 'customer' || focused ? 'customer-backdrop min-h-screen' : 'min-h-screen'
      }
    >
      <header className="border-b border-hsm-border bg-hsm-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/app" className="flex items-center gap-3 text-xl font-bold text-hsm-heading">
            <Building2 className="text-hsm-primary" strokeWidth={1.75} aria-hidden="true" />
            HSM<span className="text-sm font-normal text-hsm-secondary">Twin Cities</span>
          </Link>
          <Link className="text-link text-sm" href="/app/security">
            Account security
          </Link>
          <Button
            variant="secondary"
            onClick={() => void logout()}
            disabled={leaving}
            aria-busy={leaving}
          >
            <LogOut size={18} aria-hidden="true" />
            {leaving ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </header>
      {focused ? (
        <main id="main" className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-10">
          {logoutError ? (
            <p role="alert" className="field-error">
              {logoutError}
            </p>
          ) : null}
          {children}
        </main>
      ) : (
        <main id="main" className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
          {active === 'customer' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-3xl font-bold text-hsm-heading">Account</h1>
              <Link className="text-link" href="/">
                Find hostels
              </Link>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-hsm-primary">
                Your connected spaces
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-hsm-heading sm:text-4xl">
                Welcome, {session.data.user.fullName}
              </h1>
              <p className="mt-3 max-w-2xl leading-relaxed">
                Choose an available space. Access follows the permissions on your account.
              </p>
            </div>
          )}
          {logoutError && (
            <p role="alert" className="field-error">
              {logoutError}
            </p>
          )}
          <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Account spaces">
            {contexts
              .filter((item) => canEnter(session.data, item))
              .map((item) => {
                const Icon = icons[item];
                return (
                  <Link
                    key={item}
                    href={'/app/' + item}
                    aria-current={active === item ? 'page' : undefined}
                    className={
                      'flex items-center justify-between gap-3 rounded-card border p-5 ' +
                      (active === item
                        ? 'border-hsm-primary bg-hsm-primary text-hsm-surface'
                        : 'border-hsm-border bg-hsm-surface text-hsm-heading hover:border-hsm-primary')
                    }
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                      {labels[item]}
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                );
              })}
          </nav>
          <Inbox key={session.data.user.id} actorId={session.data.user.id} />
          {canAssociateEmail(session.data) ? (
            <EmailAssociation
              key={session.data.user.id}
              userId={session.data.user.id}
              onVerified={async (profile) => {
                const current = cache.getQueryData<SelfProfile>(['session']);
                if (current?.user.id !== profile.user.id)
                  throw new ClientFailure('INVALID_RESPONSE');
                // Drop other private caches but keep the mounted session observer subscribed;
                // clear() would detach it and leave the shell showing the unverified account.
                cache.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
                cache.setQueryData(['session'], profile);
              }}
            />
          ) : null}
          {session.data.user.emailVerified ? (
            <Link className="text-link block" href="/app/customer-profile">
              {session.data.capabilities.customer
                ? 'Edit Customer profile'
                : 'Complete Customer profile'}
            </Link>
          ) : null}
          {session.data.user.emailVerified ? (
            <Link className="text-link block" href="/app/owner-profile">
              {session.data.capabilities.owner ? 'Edit Owner profile' : 'Complete Owner profile'}
            </Link>
          ) : null}
          <StayDirectory actorId={session.data.user.id} />
          {children ??
            (active && canEnter(session.data, active) ? (
              <Space profile={session.data} context={active} />
            ) : (
              <section className="rounded-panel border border-hsm-border bg-hsm-surface p-8">
                <h2 className="text-xl font-semibold">Access unavailable</h2>
                <p className="mt-3">Choose an available account space.</p>
              </section>
            ))}
        </main>
      )}
    </div>
  );
}
function Space({ profile, context }: { profile: SelfProfile; context: Context }) {
  return (
    <section
      className={
        context === 'customer'
          ? 'space-y-5'
          : 'rounded-panel border border-hsm-border bg-hsm-surface p-6 sm:p-8'
      }
      aria-label={labels[context] + ' space'}
    >
      {context === 'customer' ? null : (
        <h2 className="text-2xl font-bold text-hsm-heading">{labels[context]} space</h2>
      )}
      {context === 'owner' || context === 'manager' ? (
        <>
          <Branches context={context} actorId={profile.user.id} />
          {context === 'owner' ? <OwnerSetup /> : null}
          {context === 'owner' ? <OwnerDashboard actorId={profile.user.id} /> : null}
        </>
      ) : context === 'customer' ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 customer-frost p-4 sm:p-5">
            <CustomerBookings actorId={profile.user.id} />
          </div>
          <div className="min-w-0 space-y-4 customer-frost p-4 sm:p-5">
            <SavedHostels actorId={profile.user.id} />
            <Visits actorId={profile.user.id} />
            <Waitlist actorId={profile.user.id} />
            <Chat actorId={profile.user.id} />
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <p>Your account is connected. More services will appear here as they become available.</p>
          {context === 'admin' && profile.capabilities.admin && (
            <p className="text-sm">
              Access:{' '}
              {profile.capabilities.admin.isRoot
                ? 'Root administrator'
                : profile.capabilities.admin.roles
                    .filter((role) => role !== 'billing')
                    .join(', ') || 'No active administrative modules'}
            </p>
          )}
          {context === 'admin' ? <ChatSafety profile={profile} /> : null}
          {context === 'admin' && profile.capabilities.admin ? (
            <AdminConsole
              actorId={profile.user.id}
              admin={profile.capabilities.admin}
              profileReviewsEnabled={profile.features?.profileReviews === true}
            />
          ) : null}
          {context === 'admin' && profile.capabilities.admin?.isRoot ? (
            <BookingPolicySettings actorId={profile.user.id} target={{ level: 'platform' }} />
          ) : null}
          {profile.user.email && <p className="text-sm text-hsm-secondary">{profile.user.email}</p>}
        </div>
      )}
      <AdminInvitation actorId={profile.user.id} />
      {profile.features?.profileReviews && !profile.capabilities.admin ? (
        <OwnProfileReviews key={profile.user.id} actorId={profile.user.id} />
      ) : null}
      <HelpSupport actorId={profile.user.id} />
    </section>
  );
}
