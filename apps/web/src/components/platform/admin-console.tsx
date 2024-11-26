'use client';
import { ProfileReviewBoard } from './profile-review-board';
import { AdminAccountControls } from './admin-account-controls';
import { CustomerGovernance } from './customer-governance';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { changeAdmin, inviteAdmin, listAdmins } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import { AnnouncementsAdministration } from './admin-settings-announcements';
import { RootPolicyAdministration } from './admin-settings-policy';
import { InstitutionAdministration } from './admin-settings-institutions';
import { VerificationOperations } from './admin-operations-verification';
import { HostelRevisionOperations } from './admin-hostel-revisions';
import { AdminExplorer } from './admin-explorer';
import { ModerationOperations } from './admin-operations-moderation';
import { SupportOperations } from './admin-operations-support';
import { PlatformAuditOperations, PlatformOverviewOperations } from './admin-operations-insights';
type Roles = { isRoot: boolean; roles: string[] };
// ADM-001..010: each section appears only for a role that may use it; the server re-checks.
export function AdminConsole({
  actorId,
  admin,
  profileReviewsEnabled = false,
}: {
  actorId: string;
  admin: Roles;
  profileReviewsEnabled?: boolean;
}) {
  const can = (role: string) => admin.isRoot || admin.roles.includes(role);
  return (
    <section aria-label="Admin console" className="space-y-4">
      <nav
        aria-label="Admin sections"
        className="flex flex-wrap gap-2 rounded-card border border-hsm-border bg-hsm-surface p-4"
      >
        {[
          ...(admin.isRoot
            ? [
                'Platform analytics',
                'Platform audit log',
                'Platform directory',
                'Administrators',
                'Root booking defaults',
                'Institution directory',
              ]
            : []),
          ...(can('verification') ? ['Hostel verification', 'Hostel changes'] : []),
          ...(can('content_moderator') ? ['Review moderation', 'Customer account governance'] : []),
          ...(can('support') ? ['Support tickets', 'Announcements'] : []),
        ].map((title) => (
          <a
            className="rounded-card border border-hsm-border px-3 py-2 text-hsm-heading focus-visible:outline focus-visible:outline-2"
            key={title}
            href={'#admin-' + title.toLowerCase().replaceAll(' ', '-')}
          >
            {title}
          </a>
        ))}
      </nav>
      {admin.isRoot ? (
        <>
          <PlatformOverviewOperations actorId={actorId} />
          <PlatformAuditOperations actorId={actorId} />
          <AdminExplorer actorId={actorId} />
        </>
      ) : null}
      {profileReviewsEnabled && admin.isRoot ? (
        <ProfileReviewBoard actorId={actorId} kind="identity" />
      ) : null}
      {profileReviewsEnabled && can('content_moderator') ? (
        <ProfileReviewBoard actorId={actorId} kind="profile_photo" />
      ) : null}
      {admin.isRoot ? <AdminAccounts actorId={actorId} /> : null}
      {can('verification') ? (
        <>
          <VerificationOperations actorId={actorId} />
          <HostelRevisionOperations actorId={actorId} />
        </>
      ) : null}
      {can('content_moderator') ? (
        <>
          <ModerationOperations actorId={actorId} />
          <CustomerGovernance actorId={actorId} />
        </>
      ) : null}
      {can('support') ? <SupportOperations actorId={actorId} /> : null}
      {can('support') ? <AnnouncementsAdministration actorId={actorId} /> : null}
      {admin.isRoot ? (
        <>
          <RootPolicyAdministration actorId={actorId} />
          <InstitutionAdministration actorId={actorId} />
        </>
      ) : null}
    </section>
  );
}
function AdminAccounts({ actorId }: { actorId: string }) {
  const key = ['admins', actorId];
  const list = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    gcTime: 0,
    retry: false,
    queryFn: ({ pageParam }) =>
      listAdmins(browserClient(), {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const [email, setEmail] = useState(''),
    [role, setRole] = useState('support');
  const invite = useCommand(
    'AdminConsole:invite',
    (body: { email: string; roles: string[] }, k) => inviteAdmin(browserClient(), body, k),
    [key],
  );
  const change = useCommand(
    'AdminConsole:change',
    (body: { userId: string; input: Record<string, unknown> }, k) =>
      changeAdmin(browserClient(), body.userId, body.input, k),
    [key],
  );
  return (
    <section id="admin-administrators" aria-label="Administrators" className="space-y-1">
      <CommandRecovery command={invite} />
      <CommandRecovery command={change} />
      <h3 className="font-semibold">Administrators</h3>
      {invite.isError || change.isError ? (
        <p role="alert">{errorMessage(invite.error ?? change.error)}</p>
      ) : null}
      {!list.isError &&
        list.data?.pages
          .flatMap((page) => page.data)
          .map((row) => (
            <div key={row.userId}>
              <p>
                {row.fullName} · {row.isRoot ? 'Root' : row.roles.join(', ')} · {row.status}
              </p>
              <AdminAccountControls
                row={row}
                actorId={actorId}
                locked={change.isPending || change.unresolved}
                save={(input, complete) =>
                  change.mutate({ userId: row.userId, input }, { onSuccess: complete })
                }
              />
            </div>
          ))}
      {list.isError ? <p role="alert">{errorMessage(list.error)}</p> : null}
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={list.isFetching}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          Load more Admins
        </Button>
      ) : null}
      <input
        aria-label="Invite admin email"
        className="field-input"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <select
        aria-label="Admin role"
        className="field-input"
        value={role}
        onChange={(event) => setRole(event.target.value)}
      >
        <option value="verification">Verification</option>
        <option value="support">Support</option>
        <option value="content_moderator">Content moderator</option>
      </select>
      <Button
        disabled={!email.trim() || invite.isPending}
        onClick={() => invite.mutate({ email: email.trim(), roles: [role] })}
      >
        Invite admin
      </Button>
    </section>
  );
}
