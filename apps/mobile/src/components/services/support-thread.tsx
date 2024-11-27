import { Skeleton } from '../loading/skeleton';
import { useInfiniteQuery } from '@tanstack/react-query';
import { readOwnSupportMessages } from '@hsm/api-client';
import { actorClient } from '../../lib/runtime';
import { withFreshSession } from '../../lib/fresh-session';
import { safeMessage } from '../../lib/messages';
import { Button, Copy } from '../ui';
export function OwnSupportThread({ actorId, ticketId }: { actorId: string; ticketId: string }) {
  const query = useInfiniteQuery({
    queryKey: ['own-ticket-messages', actorId, ticketId],
    initialPageParam: undefined as string | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam }) =>
      withFreshSession(async () =>
        readOwnSupportMessages(await actorClient(actorId), ticketId, {
          limit: 50,
          ...(pageParam ? { cursor: pageParam } : {}),
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const hidden = query.isError || (query.isFetching && !query.isFetchingNextPage);
  return (
    <>
      {query.isPending ? <Skeleton kind="chat" label="Loading ticket messages…" /> : null}
      {query.isError ? <Copy alert>{safeMessage(query.error)}</Copy> : null}
      {hidden
        ? null
        : query.data?.pages
            .flatMap((p) => p.data)
            .map((message) => (
              <Copy key={message.id}>
                {message.fromSupport ? 'HSM support' : 'You'}: {message.body}
              </Copy>
            ))}
      {query.hasNextPage ? (
        <Button
          secondary
          label="Load more ticket messages"
          disabled={query.isFetching}
          onPress={() => {
            void query.fetchNextPage();
          }}
        />
      ) : null}
    </>
  );
}
