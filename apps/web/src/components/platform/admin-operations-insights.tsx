'use client';
import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { downloadPlatformAudit, readPlatformAudit, readPlatformOverview } from '@hsm/api-client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import {
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function PlatformOverviewOperations({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'platform-overview', 'root');
  const [from, setFrom] = useState(() => today().slice(0, 8) + '01'),
    [to, setTo] = useState(today);
  const [range, setRange] = useState({ from, to });
  const metrics = useQuery({
    queryKey: [...scope.key, range],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => scope.read((c) => readPlatformOverview(c, range), signal),
  });
  const current = !metrics.isError && !metrics.isFetching ? metrics.data : undefined;
  return (
    <OperationSection title="Platform analytics">
      <p>
        Global aggregates. Snapshots describe now; window values use inclusive Asia/Karachi dates.
      </p>
      <label>
        From
        <input
          type="date"
          aria-label="Platform metrics from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label>
        To
        <input
          type="date"
          aria-label="Platform metrics to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      <Button
        disabled={!from || !to || from > to || metrics.isFetching}
        onClick={() => setRange({ from, to })}
      >
        Apply metric dates
      </Button>
      <OperationState
        pending={metrics.isPending || metrics.isFetching}
        error={metrics.error}
        retry={() => void metrics.refetch()}
      />
      {current ? (
        <>
          <p>Updated {current.generatedAt}</p>
          <h4 className="font-semibold">Current platform snapshot</h4>
          <dl className="grid gap-3 sm:grid-cols-3">
            {Object.entries(current.snapshot)
              .filter(([key]) => key !== 'announcements')
              .map(([key, value]) => (
                <div key={key} className="rounded-card border border-hsm-border p-3">
                  <dt>{key.replaceAll(/([A-Z])/g, ' $1')}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
          </dl>
          <p>
            Announcements: {current.snapshot.announcements.scheduled} scheduled ·{' '}
            {current.snapshot.announcements.sent} sent · {current.snapshot.announcements.cancelled}{' '}
            cancelled
          </p>
          <h4 className="font-semibold">
            Window {current.from} to {current.to}
          </h4>
          <p>
            Registered users {current.window.registeredUsers} · Booking requests{' '}
            {current.window.bookingRequests} · Check-ins {current.window.checkedIn}
          </p>
          <p>
            Conversations {current.window.conversations} · Visits {current.window.visitRequests}
          </p>
          <p>
            Responded requests {current.window.respondedRequests} · Average first response{' '}
            {current.window.averageResponseHours === null
              ? 'Unavailable'
              : current.window.averageResponseHours.toFixed(1) + ' hours'}{' '}
            · Over 24 hours {current.window.slowResponses}
          </p>
          <table>
            <caption>Current states of bookings submitted in the window</caption>
            <thead>
              <tr>
                <th>State</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {current.window.bookingStates.map((row) => (
                <tr key={row.state}>
                  <td>{row.state}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Searches, listing views and occupancy freshness are not collected. Commercial retention
            remains deferred. No conversion funnel is inferred.
          </p>
        </>
      ) : null}
    </OperationSection>
  );
}
type Filters = {
  action?: string;
  targetType?: string;
  actorId?: string;
  from?: string;
  to?: string;
};
export function PlatformAuditOperations({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'platform-audit', 'root');
  const [action, setAction] = useState(''),
    [targetType, setTargetType] = useState(''),
    [actor, setActor] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [filters, setFilters] = useState<Filters>({});
  const [download, setDownload] = useState<{ actorId: string; csv: string; truncated: boolean }>();

  useEffect(() => {
    setDownload(undefined);
  }, [actorId]);
  const entries = useInfiniteQuery({
    queryKey: [...scope.key, filters],
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readPlatformAudit(c, {
            ...filters,
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const exportFile = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async () => {
      const result = await scope.read((c) => downloadPlatformAudit(c, filters));
      return { ...result, actorId };
    },
    onSuccess: setDownload,
    onError: () => setDownload(undefined),
  });
  const rows = entries.isError ? [] : (entries.data?.pages.flatMap((page) => page.data) ?? []);
  return (
    <OperationSection title="Platform audit log">
      <p>
        Append-only metadata. Private payloads, contacts, IP addresses and credentials are excluded.
      </p>
      <label>
        Exact action
        <input
          aria-label="Audit action filter"
          className="field-input"
          value={action}
          maxLength={120}
          onChange={(e) => setAction(e.target.value)}
        />
      </label>
      <label>
        Exact target type
        <input
          aria-label="Audit target type filter"
          className="field-input"
          value={targetType}
          maxLength={80}
          onChange={(e) => setTargetType(e.target.value)}
        />
      </label>
      <label>
        Actor identifier
        <input
          aria-label="Audit actor filter"
          className="field-input"
          value={actor}
          maxLength={36}
          onChange={(e) => setActor(e.target.value)}
        />
      </label>
      <label>
        From
        <input
          type="date"
          aria-label="Audit from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label>
        To
        <input
          type="date"
          aria-label="Audit to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      <Button
        disabled={Boolean(from && to && from > to)}
        onClick={() => {
          setDownload(undefined);
          setFilters({
            ...(action.trim() ? { action: action.trim() } : {}),
            ...(targetType.trim() ? { targetType: targetType.trim() } : {}),
            ...(actor.trim() ? { actorId: actor.trim() } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          });
        }}
      >
        Apply audit filters
      </Button>
      <OperationState
        pending={entries.isPending}
        error={entries.error}
        retry={() => void entries.refetch()}
        empty={!rows.length}
      />
      {!entries.isError ? (
        <ol>
          {rows.map((row) => (
            <li key={row.id} className="border-b border-hsm-border py-3">
              <p>
                {row.createdAt} · {row.action} · {row.actorRole}
              </p>
              <p>
                Actor {row.actorId ?? 'System'} · Target {row.targetType} / {row.targetId}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      {!entries.isError && !entries.isPending ? (
        <OperationPages
          hasMore={Boolean(entries.hasNextPage)}
          fetching={entries.isFetching}
          more={() => void entries.fetchNextPage()}
          refresh={() => {
            setDownload(undefined);
            void entries.refetch();
          }}
        />
      ) : null}
      <Button
        variant="secondary"
        disabled={exportFile.isPending}
        onClick={() => {
          setDownload(undefined);
          exportFile.mutate();
        }}
      >
        Generate audit metadata CSV
      </Button>
      {exportFile.isError ? <p role="alert">{errorMessage(exportFile.error)}</p> : null}
      {download?.actorId === actorId && !entries.isError && !entries.isFetching ? (
        <>
          <p>
            {download.truncated
              ? 'First 5000 matching entries only; narrow filters for remaining records.'
              : 'Complete matching export within 5000-row bound.'}
          </p>
          <a
            download="hsm-platform-audit.csv"
            href={'data:text/csv;charset=utf-8,' + encodeURIComponent(download.csv)}
          >
            Download audit metadata CSV
          </a>
        </>
      ) : null}
    </OperationSection>
  );
}
