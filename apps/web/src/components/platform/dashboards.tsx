'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportTypeSchema } from '@hsm/contracts';
import {
  marketplacePrice,
  readBranchDashboard,
  readOwnerAnalytics,
  readOwnerDashboard,
  reportDownloadPath,
} from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useReportDownload } from './use-report-download';
import { ReportFilters, reportLabels } from './report-filters';
import { ReportView } from './report-view';
import { DashboardProofAction } from './dashboard-proof-action';
import { DashboardBookingAction } from './dashboard-booking-action';
import { DashboardQueueLink } from './dashboard-queue-link';
import { karachiToday } from '../../lib/karachi-time';
import type { DashboardContext } from '../../lib/dashboard-queue-path';
type Actions = {
  pendingBookings: number;
  pendingProofs: number;
  openComplaints: number;
  upcomingCheckouts: number;
  overdueInvoices: number;
};
// OWN-003: each count names the queue it comes from, so it can be opened and acted on.
function ActionList({
  actions,
  actorId,
  branches,
  context,
  branchId,
}: {
  actions: Actions;
  actorId: string;
  branches: { branchId: string; branchName: string }[];
  context: DashboardContext;
  branchId?: string;
}) {
  const items = [
    ['overdue', 'Overdue invoices', actions.overdueInvoices],
    ['complaints', 'Unresolved complaints', actions.openComplaints],
    ['checkouts', 'Upcoming checkouts (14 days)', actions.upcomingCheckouts],
  ] as const;
  return (
    <ul aria-label="Actions required">
      <li>
        <DashboardBookingAction
          actorId={actorId}
          branches={branches}
          count={actions.pendingBookings}
        />
        <DashboardQueueLink
          actorId={actorId}
          context={context}
          queue="bookings"
          {...(branchId ? { branchId } : {})}
        >
          Open booking requests page
        </DashboardQueueLink>
      </li>
      <li>
        <DashboardProofAction actorId={actorId} branches={branches} count={actions.pendingProofs} />
        <DashboardQueueLink
          actorId={actorId}
          context={context}
          queue="proofs"
          {...(branchId ? { branchId } : {})}
        >
          Open payment proofs page
        </DashboardQueueLink>
      </li>
      {items.map(([queue, label, count]) => (
        <li key={label}>
          <DashboardQueueLink
            actorId={actorId}
            context={context}
            queue={queue}
            {...(branchId ? { branchId } : {})}
          >
            {label}: {count}
          </DashboardQueueLink>
        </li>
      ))}
    </ul>
  );
}
// RPT-001/002: authenticated same-origin downloads; the server scopes and audits them.
type ReportDownloadProps = { branchId?: string; actorId?: string };
export function ReportDownloads(props: ReportDownloadProps) {
  return (
    <ScopedReportDownloads
      key={(props.actorId ?? 'unavailable') + ':' + (props.branchId ?? 'owner')}
      {...props}
    />
  );
}
function ScopedReportDownloads({ branchId, actorId }: ReportDownloadProps) {
  const { download, pending, message } = useReportDownload();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const invalidRange = Boolean(from && to && from > to);
  const scope = {
    ...(branchId ? { branchId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  return (
    <section aria-label="Reports" className="space-y-2">
      <h3 className="font-semibold">Reports</h3>
      {actorId ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          {filtersOpen ? 'Show all report downloads' : 'Filter reports'}
        </Button>
      ) : null}
      <label className="field-label">
        From
        <input
          aria-label="Report from"
          disabled={pending}
          type="date"
          className="field-input"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </label>
      <label className="field-label">
        To
        <input
          aria-label="Report to"
          disabled={pending}
          type="date"
          className="field-input"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </label>
      {invalidRange ? <p role="alert">Report From must be on or before To.</p> : null}
      {filtersOpen && actorId ? (
        <ReportFilters
          actorId={actorId}
          {...(branchId ? { branchId } : {})}
          from={from}
          to={to}
          disabled={pending || invalidRange}
          download={download}
        />
      ) : null}
      <ul>
        {(!invalidRange && !filtersOpen ? reportTypeSchema.options : []).map((type) => (
          <li key={type}>
            {reportLabels[type]}:{' '}
            <a
              href={'/api' + reportDownloadPath(type, 'csv', scope)}
              onClick={download}
              aria-disabled={pending}
            >
              CSV
            </a>{' '}
            ·{' '}
            <a
              href={'/api' + reportDownloadPath(type, 'pdf', scope)}
              onClick={download}
              aria-disabled={pending}
            >
              PDF
            </a>
          </li>
        ))}
      </ul>
      {actorId && !invalidRange ? (
        <ReportView actorId={actorId} {...(branchId ? { branchId } : {})} from={from} to={to} />
      ) : null}
      {pending ? <p role="status">Preparing report download…</p> : null}
      {message ? <p role="alert">{message}</p> : null}
    </section>
  );
}
// OWN-001..004: owned branches only; totals are the server's sums of the rows shown.
export function OwnerDashboard({ actorId }: { actorId: string }) {
  const [branchId, setBranchId] = useState(''),
    [analytics, setAnalytics] = useState(false),
    [cursor, setCursor] = useState<string>();
  const dash = useQuery({
    queryKey: ['owner-dashboard', actorId, branchId, ...(cursor ? [cursor] : [])],
    gcTime: 0,
    retry: false,
    queryFn: () =>
      readOwnerDashboard(browserClient(), branchId ? { branchId } : cursor ? { cursor } : {}),
  });
  const today = karachiToday();
  const insights = useQuery({
    queryKey: ['owner-analytics', actorId],
    enabled: analytics,
    gcTime: 0,
    retry: false,
    queryFn: () =>
      readOwnerAnalytics(browserClient(), { from: today.slice(0, 8) + '01', to: today }),
  });
  if (dash.isPending) return <p role="status">Loading dashboard…</p>;
  if (dash.isError) return <p role="alert">{errorMessage(dash.error)}</p>;
  const { totals } = dash.data;
  return (
    <section aria-label="Owner dashboard" className="space-y-3">
      <h3 className="font-semibold">Dashboard ({dash.data.month})</h3>
      <label className="field-label">
        Branch
        <select
          aria-label="Dashboard branch"
          className="field-input"
          value={branchId}
          onChange={(event) => {
            setCursor(undefined);
            setBranchId(event.target.value);
          }}
        >
          <option value="">All branches</option>
          {dash.data.branches.map((row) => (
            <option key={row.branchId} value={row.branchId}>
              {row.branchName}
            </option>
          ))}
        </select>
      </label>
      <p>
        Beds {totals.beds.beds} · Occupied {totals.beds.occupied} · Available{' '}
        {totals.beds.available} · Reserved {totals.beds.reserved} · Blocked {totals.beds.blocked} ·
        Active residents {totals.activeResidents}
      </p>
      <p>
        Rent this month: expected {marketplacePrice(totals.rent.expectedPaisa)} · collected{' '}
        {marketplacePrice(totals.rent.collectedPaisa)} · outstanding{' '}
        {marketplacePrice(totals.rent.outstandingPaisa)}
      </p>
      <ActionList
        actions={totals.actions}
        actorId={actorId}
        branches={dash.data.branches}
        context="owner"
        {...(branchId ? { branchId } : {})}
      />
      <table aria-label="Branches" className="w-full text-left">
        <thead>
          <tr>
            <th scope="col">Branch</th>
            <th scope="col">Occupancy</th>
            <th scope="col">Outstanding</th>
            <th scope="col">Subscription</th>
          </tr>
        </thead>
        <tbody>
          {dash.data.branches.map((row) => (
            <tr key={row.branchId}>
              <th scope="row">{row.branchName}</th>
              <td>{row.occupancyPercent}%</td>
              <td>{marketplacePrice(row.rent.outstandingPaisa)}</td>
              <td>Not active yet (deferred)</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!branchId ? (
        <p>Totals cover all owned branches. The table and branch choices show the current page.</p>
      ) : null}
      {dash.data.nextCursor ? (
        <Button
          disabled={dash.isFetching}
          onClick={() => setCursor(dash.data.nextCursor ?? undefined)}
        >
          Next dashboard branches
        </Button>
      ) : null}
      {cursor ? (
        <Button variant="secondary" disabled={dash.isFetching} onClick={() => setCursor(undefined)}>
          First dashboard branches
        </Button>
      ) : null}
      <ReportDownloads actorId={actorId} {...(branchId ? { branchId } : {})} />
      <Button variant="secondary" onClick={() => setAnalytics(true)}>
        Show booking analytics
      </Button>
      {insights.data ? (
        <section aria-label="Booking analytics">
          <p>
            Listing views and searches are not collected, so the funnel starts at chats and visit
            requests.
          </p>
          {insights.data.branches.map((row) => (
            <p key={row.branchId}>
              {row.branchName}: chats {row.conversations} · visits {row.visitRequests} · requests{' '}
              {row.bookingRequests} · confirmed {row.confirmed} · checked in {row.checkedIn} ·
              average response{' '}
              {row.averageResponseHours === null ? 'n/a' : row.averageResponseHours + ' h'}
              {row.warnings.length ? ' · ' + row.warnings.join('; ') : ''}
            </p>
          ))}
        </section>
      ) : null}
    </section>
  );
}
// MGRD-001..005: the selected branch only; money is shown only when the server includes it.
export function BranchDashboard({
  actorId,
  branchId,
  context = 'manager',
}: {
  actorId: string;
  branchId: string;
  context?: DashboardContext;
}) {
  const dash = useQuery({
    queryKey: ['branch-dashboard', actorId, branchId],
    gcTime: 0,
    retry: false,
    queryFn: () => readBranchDashboard(browserClient(), branchId),
  });
  if (dash.isPending) return <p role="status">Loading branch dashboard…</p>;
  if (dash.isError) return <p role="alert">{errorMessage(dash.error)}</p>;
  const d = dash.data;
  return (
    <section aria-label="Branch dashboard" className="space-y-1">
      <h3 className="font-semibold">Today ({d.asOf})</h3>
      <p>
        Move-ins {d.today.moveIns} · Checkouts {d.today.checkouts} · Visits {d.today.visits} ·
        Available beds {d.beds.available} · Unread notices {d.unreadNotices}
      </p>
      <ActionList
        actions={d.queue}
        actorId={actorId}
        branches={[{ branchId, branchName: 'Selected branch' }]}
        context={context}
        branchId={branchId}
      />
      {d.rent ? (
        <p>Rent this month: outstanding {marketplacePrice(d.rent.outstandingPaisa)}</p>
      ) : null}
    </section>
  );
}
