'use client';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  listAdminExplorer,
  readAdminExplorerDetail,
  readAdminExplorerSummary,
} from '@hsm/api-client';
import {
  adminExplorerKindSchema,
  formatDate,
  type AdminExplorerKind,
  type AdminExplorerQuery,
} from '@hsm/contracts';
import { Button } from '../ui/button';
import {
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
type Scope = ReturnType<typeof useOperationScope>;
type Link = Partial<Pick<AdminExplorerQuery, 'parentId' | 'ownerId' | 'managerId'>>;
type View = { kind: AdminExplorerKind; link: Link; id?: string };
export const explorerTitles: Record<AdminExplorerKind, string> = {
  users: 'Users',
  owners: 'Owners',
  managers: 'Managers',
  hostels: 'Hostels',
  branches: 'Branches',
  bookings: 'Bookings',
  complaints: 'Complaints',
  occupancy: 'Residents now',
  payments: 'Payments approved',
};
// Exact paisa text without floating-point arithmetic.
export function paisaText(value: string) {
  const amount = BigInt(value);
  return (
    'PKR ' +
    (amount / 100n).toLocaleString('en-PK') +
    '.' +
    (amount % 100n).toString().padStart(2, '0')
  );
}
// HMA-017: Root's searchable directories with calendar-cohort counts. Metadata only; private
// documents and payment proofs stay in their own audited workspaces.
export function AdminExplorer({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'explorer', 'root');
  const [view, setView] = useState<View>();
  const summary = useQuery({
    queryKey: [...scope.key, 'summary'],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => scope.read((c) => readAdminExplorerSummary(c), signal),
  });
  return (
    <OperationSection title="Platform directory">
      <OperationState
        pending={summary.isPending}
        error={summary.error}
        retry={() => void summary.refetch()}
      />
      <div className="flex flex-wrap gap-2">
        {adminExplorerKindSchema.options.map((kind) => (
          <Button
            key={kind}
            variant={view?.kind === kind && !view.id ? 'primary' : 'secondary'}
            onClick={() => setView({ kind, link: {} })}
          >
            {explorerTitles[kind]}
            {summary.data ? ' · ' + summary.data.counts[kind].toLocaleString('en-PK') : ''}
          </Button>
        ))}
      </div>
      {view?.id ? (
        <ExplorerDetail
          key={view.kind + view.id}
          scope={scope}
          kind={view.kind}
          id={view.id}
          open={setView}
          back={() => setView({ kind: view.kind, link: view.link })}
        />
      ) : view ? (
        <ExplorerList
          key={view.kind + JSON.stringify(view.link)}
          scope={scope}
          kind={view.kind}
          link={view.link}
          open={(id) => setView({ ...view, id })}
        />
      ) : null}
    </OperationSection>
  );
}
function Choice(props: {
  label: string;
  value: string;
  values: { value: string; label: string }[];
  change: (value: string) => void;
}) {
  return (
    <label className="field-label">
      {props.label}
      <select
        className="field-input"
        value={props.value}
        onChange={(e) => props.change(e.target.value)}
      >
        {props.values.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function ExplorerList(props: {
  scope: Scope;
  kind: AdminExplorerKind;
  link: Link;
  open: (id: string) => void;
}) {
  const { scope, kind } = props;
  const [draft, setDraft] = useState(''),
    [q, setQ] = useState(''),
    [period, setPeriod] = useState<AdminExplorerQuery['period']>('lifetime'),
    [sort, setSort] = useState<AdminExplorerQuery['sort']>('newest'),
    [status, setStatus] = useState('');
  const input = { ...props.link, q, period, sort, status };
  const list = useInfiniteQuery({
    queryKey: [...scope.key, 'list', kind, input],
    initialPageParam: undefined as string | undefined,
    gcTime: 0,
    retry: false,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          listAdminExplorer(c, kind, { ...input, ...(pageParam ? { cursor: pageParam } : {}) }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const first = list.isError ? undefined : list.data?.pages[0],
    rows = first ? (list.data?.pages.flatMap((page) => page.data) ?? []) : [];
  const count = (key: 'month' | 'quarter' | 'year' | 'lifetime') =>
    first ? ' · ' + first.statistics[key].toLocaleString('en-PK') : '';
  return (
    <div className="space-y-3 border-t border-hsm-border pt-4">
      <h4 className="font-semibold">{explorerTitles[kind]}</h4>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(draft.trim());
        }}
      >
        <label className="field-label">
          Search name or record ID
          <input
            className="field-input"
            value={draft}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <Button type="submit" variant="secondary">
          Search directory
        </Button>
      </form>
      <Choice
        label={first?.statisticsLabel ?? 'Record period'}
        value={period}
        change={(value) => setPeriod(value as AdminExplorerQuery['period'])}
        values={[
          { value: 'month', label: 'This month' + count('month') },
          { value: 'quarter', label: 'This quarter' + count('quarter') },
          { value: 'year', label: 'This year' + count('year') },
          { value: 'lifetime', label: 'Lifetime' + count('lifetime') },
        ]}
      />
      <Choice
        label="Sort records"
        value={sort}
        change={(value) => setSort(value as AdminExplorerQuery['sort'])}
        values={[
          { value: 'newest', label: 'Newest first' },
          { value: 'oldest', label: 'Oldest first' },
          { value: 'name_asc', label: 'Name A–Z' },
          { value: 'name_desc', label: 'Name Z–A' },
        ]}
      />
      <Choice
        label="Record status"
        value={status}
        change={setStatus}
        values={[
          { value: '', label: 'All' },
          ...[...new Set([...(first?.statuses ?? []), ...(status ? [status] : [])])].map(
            (value) => ({
              value,
              label: value.replaceAll('_', ' '),
            }),
          ),
        ]}
      />
      {first ? (
        <p className="text-sm">
          {first.totalCount.toLocaleString('en-PK')} records
          {first.quantity !== null
            ? ' · ' +
              first.quantity +
              (kind === 'payments' ? ' approved payments' : ' occupied placements')
            : ''}
          {first.amountPaisa !== null
            ? ' · ' + paisaText(first.amountPaisa) + ' hostel-direct'
            : ''}
          {first.notice ? ' · ' + first.notice : ''}
        </p>
      ) : null}
      <OperationState
        pending={list.isPending}
        error={list.error}
        retry={() => void list.refetch()}
        empty={!rows.length}
      />
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id}>
            <Button variant="secondary" onClick={() => props.open(row.id)}>
              {'View profile ' + row.name}
            </Button>{' '}
            <span className="text-sm">
              {[
                formatDate(row.createdAt),
                row.status.replaceAll('_', ' '),
                row.parentName,
                row.reason,
                row.amountPaisa !== null ? paisaText(row.amountPaisa) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
      {first ? (
        <OperationPages
          hasMore={Boolean(list.hasNextPage)}
          fetching={list.isFetching}
          more={() => void list.fetchNextPage()}
          refresh={() => void list.refetch()}
        />
      ) : null}
    </div>
  );
}
const actionTargets = {
  verification: { href: '#admin-hostel-verification', label: 'Open Hostel verification' },
  customer_governance: {
    href: '#admin-customer-account-governance',
    label: 'Open Customer account governance',
  },
};
function ExplorerDetail(props: {
  scope: Scope;
  kind: AdminExplorerKind;
  id: string;
  open: (view: View) => void;
  back: () => void;
}) {
  const { scope, kind, id } = props;
  const detail = useQuery({
    queryKey: [...scope.key, 'detail', kind, id],
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => scope.read((c) => readAdminExplorerDetail(c, kind, id), signal),
  });
  const data = detail.data;
  return (
    <div className="space-y-3 border-t border-hsm-border pt-4">
      <Button variant="secondary" onClick={props.back}>
        Back to {explorerTitles[kind]}
      </Button>
      <OperationState
        pending={detail.isPending}
        error={detail.error}
        retry={() => void detail.refetch()}
      />
      {data ? (
        <>
          <h4 className="font-semibold">{data.record.name}</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            <dt className="text-sm text-hsm-secondary">Status</dt>
            <dd>{data.record.status.replaceAll('_', ' ')}</dd>
            <dt className="text-sm text-hsm-secondary">Created</dt>
            <dd>{formatDate(data.record.createdAt)}</dd>
            {data.record.parentName ? (
              <>
                <dt className="text-sm text-hsm-secondary">Belongs to</dt>
                <dd>{data.record.parentName}</dd>
              </>
            ) : null}
            {data.facts.map((fact) => (
              <div key={fact.label} className="contents">
                <dt className="text-sm text-hsm-secondary">{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
            <dt className="text-sm text-hsm-secondary">Record ID</dt>
            <dd className="break-all">{data.record.id}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            {data.links.map((link) => (
              <Button
                key={link.label}
                variant="secondary"
                onClick={() =>
                  props.open({
                    kind: link.kind,
                    link: {
                      ...(link.parentId ? { parentId: link.parentId } : {}),
                      ...(link.ownerId ? { ownerId: link.ownerId } : {}),
                      ...(link.managerId ? { managerId: link.managerId } : {}),
                    },
                    ...(link.id ? { id: link.id } : {}),
                  })
                }
              >
                {link.label}
              </Button>
            ))}
          </div>
          {data.action !== 'none' ? (
            <a className="text-link" href={actionTargets[data.action].href}>
              {actionTargets[data.action].label}
            </a>
          ) : null}
          {data.notice ? <p className="text-sm">{data.notice}</p> : null}
        </>
      ) : null}
    </div>
  );
}
