'use client';
import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { readVerificationSnapshots, readVerificationSnapshotItems } from '@hsm/api-client';
import { formatExactMoney, money } from '@hsm/contracts';
const marketplacePrice = (value: string) => formatExactMoney(money(BigInt(value)));
import { Button } from '../ui/button';
import { OperationPages, OperationState, useOperationScope } from './admin-operations';
type Scope = ReturnType<typeof useOperationScope>;
export function VerificationSubmissionComparison({
  branchId,
  scope,
}: {
  branchId: string;
  scope: Scope;
}) {
  const [selected, setSelected] = useState<{ id: string; kind: 'pricing' | 'photo' }>();
  const query = useQuery({
    queryKey: [...scope.key, 'submissions', branchId],
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => scope.read((c) => readVerificationSnapshots(c, branchId), signal),
  });
  const d = !query.isError && !query.isFetching ? query.data : undefined;
  return (
    <section aria-label="Verification submission comparison" className="space-y-3">
      <h4 className="font-semibold">Submitted evidence comparison</h4>
      <OperationState
        pending={query.isPending || query.isFetching}
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      {d ? (
        <>
          {d.historicalSnapshotUnavailable ? (
            <p>Historical snapshot unavailable; no previous evidence is inferred.</p>
          ) : null}
          <p>Changed fields: {d.changedFields.join(', ') || 'No recorded differences'}</p>
          {(
            [
              ['Current submission', d.current],
              ['Last approved submission', d.lastApproved],
            ] as const
          ).map(([label, snapshot]) => (
            <article key={label} className="space-y-2 rounded-card border p-3">
              <h5>{label}</h5>
              {snapshot ? (
                <>
                  <p>
                    {snapshot.dossier.branchName} ·{' '}
                    {snapshot.dossier.addressLine ?? 'Address unavailable'}
                  </p>
                  <p>
                    Submitted{' '}
                    {new Date(snapshot.submittedAt).toLocaleString('en-PK', {
                      timeZone: 'Asia/Karachi',
                    })}{' '}
                    PKT
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setSelected({ id: snapshot.id, kind: 'pricing' })}
                  >
                    View {label.toLowerCase()} prices
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setSelected({ id: snapshot.id, kind: 'photo' })}
                  >
                    View {label.toLowerCase()} photos
                  </Button>
                </>
              ) : (
                <p>No persisted snapshot.</p>
              )}
            </article>
          ))}
        </>
      ) : null}
      {selected ? (
        <SnapshotItems
          key={selected.id + selected.kind}
          scope={scope}
          branchId={branchId}
          id={selected.id}
          kind={selected.kind}
        />
      ) : null}
    </section>
  );
}
function SnapshotItems({
  branchId,
  id,
  kind,
  scope,
}: {
  branchId: string;
  id: string;
  kind: 'pricing' | 'photo';
  scope: Scope;
}) {
  const query = useInfiniteQuery({
    queryKey: [...scope.key, 'submission-items', branchId, id, kind],
    retry: false,
    gcTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readVerificationSnapshotItems(c, branchId, id, {
            kind,
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows =
    query.isError || (query.isFetching && !query.isFetchingNextPage)
      ? []
      : (query.data?.pages.flatMap((p) => p.data) ?? []);
  return (
    <>
      <OperationState
        pending={query.isPending}
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
        empty={rows.length === 0}
      />
      {rows.map((row) => (
        <p key={row.sourceId}>
          {row.kind === 'photo'
            ? row.data.altText || 'Submitted listing photo'
            : row.data.name +
              ' · deposit ' +
              marketplacePrice(row.data.depositPaisa) +
              ' · bed rent ' +
              (row.data.bedMonthlyRentPaisa === null
                ? 'Not offered'
                : marketplacePrice(row.data.bedMonthlyRentPaisa))}
        </p>
      ))}
      <OperationPages
        hasMore={query.hasNextPage}
        fetching={query.isFetching}
        more={() => {
          void query.fetchNextPage();
        }}
        refresh={() => {
          void query.refetch();
        }}
      />
    </>
  );
}
