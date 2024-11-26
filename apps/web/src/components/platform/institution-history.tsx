'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { readAdminInstitutionHistory } from '@hsm/api-client';
import { OperationPages, OperationState, useOperationScope } from './admin-operations';
export function InstitutionHistory({ id, actorId }: { id: string; actorId: string }) {
  const scope = useOperationScope(actorId, 'institution-history', 'root');
  const history = useInfiniteQuery({
    queryKey: [...scope.key, id],
    initialPageParam: undefined as string | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (client) =>
          readAdminInstitutionHistory(client, id, {
            ...(pageParam ? { cursor: pageParam } : {}),
            limit: 20,
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows =
    history.isError || (history.isFetching && !history.isFetchingNextPage)
      ? []
      : (history.data?.pages.flatMap((p) => p.data) ?? []);
  return (
    <section aria-label="Institution revision history" className="space-y-3">
      <h4>Institution revision history</h4>
      <OperationState
        pending={history.isPending || history.isFetching}
        error={history.error}
        empty={!rows.length}
        retry={() => {
          void history.refetch();
        }}
      />
      {rows.map((row) => (
        <article key={row.revision}>
          <p>
            Revision {row.revision} · {row.createdAt} · Actor{' '}
            {row.actorId ?? 'Historical actor unavailable'}
          </p>
          <p>
            {row.approval} · {row.reason ?? 'Historical reason unavailable'}
          </p>
          <dl>
            {row.changedFields.map((field) => (
              <div key={field}>
                <dt>{field}</dt>
                <dd>
                  {JSON.stringify(row.before?.[field] ?? null)} →{' '}
                  {JSON.stringify(row.after?.[field] ?? null)}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
      <OperationPages
        hasMore={Boolean(history.hasNextPage)}
        fetching={history.isFetching}
        more={() => {
          void history.fetchNextPage();
        }}
        refresh={() => {
          void history.refetch();
        }}
      />
    </section>
  );
}
