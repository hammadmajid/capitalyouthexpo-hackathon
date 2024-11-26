'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { readOwnSupportMessages } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
export function OwnSupportThread({ actorId, ticketId }: { actorId: string; ticketId: string }) {
  const query = useInfiniteQuery({
    queryKey: ['own-ticket-messages', actorId, ticketId],
    retry: false,
    gcTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      readOwnSupportMessages(browserClient(), ticketId, {
        limit: 50,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const hidden = query.isError || (query.isFetching && !query.isFetchingNextPage);
  return (
    <>
      {query.isPending ? <p role="status">Loading ticket messages…</p> : null}
      {query.isError ? <p role="alert">{errorMessage(query.error)}</p> : null}
      <ol aria-label="Ticket messages">
        {hidden
          ? null
          : query.data?.pages
              .flatMap((p) => p.data)
              .map((message) => (
                <li key={message.id}>
                  {message.fromSupport ? 'HSM support' : 'You'}: {message.body}
                </li>
              ))}
      </ol>
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetching}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          Load more ticket messages
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={query.isFetching}
        onClick={() => {
          void query.refetch();
        }}
      >
        Refresh ticket messages
      </Button>
    </>
  );
}
