'use client';
import { Bell, Check } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useInbox } from './use-inbox';
import { errorMessage } from '../lib/messages';
import { karachiDateTime } from '../lib/karachi-time';
import { Button } from './ui/button';
export function Inbox({ actorId }: { actorId: string }) {
  return <Workspace key={actorId} actorId={actorId} />;
}
function Workspace({ actorId }: { actorId: string }) {
  const [open, setOpen] = useState(false);
  const { query, mark } = useInbox(actorId, open);
  return (
    <section aria-label="Notifications" className="space-y-3">
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        <Bell size={18} aria-hidden />
        {open ? 'Close notifications' : 'Notifications'}
      </Button>
      {open ? (
        query.isError ? (
          <>
            <p role="alert">{errorMessage(query.error)}</p>
            <Button onClick={() => void query.refetch()}>Retry notifications</Button>
          </>
        ) : query.isPending || (query.isFetching && !query.isFetchingNextPage) ? (
          <div
            className="customer-skeleton h-28"
            role="status"
            aria-label="Loading notifications"
          />
        ) : (
          <>
            <p>{query.data.pages[0]?.unreadCount} unread</p>
            {query.data.pages.every((page) => page.data.length === 0) ? (
              <p>No notifications yet.</p>
            ) : null}
            {mark.error ? <p role="alert">{errorMessage(mark.error)}</p> : null}
            {query.data.pages
              .flatMap((page) => page.data)
              .map((notice) => (
                <article key={notice.id} className="customer-frost space-y-2 p-4">
                  <h3>{notice.title}</h3>
                  <p>{notice.body}</p>
                  <time dateTime={notice.createdAt}>{karachiDateTime(notice.createdAt)}</time>
                  {notice.type === 'waitlist.vacancy' ? (
                    <Link className="text-link block" href="/app/customer#waiting-list">
                      Open my waiting list
                    </Link>
                  ) : null}
                  {notice.type === 'chat.message.created' ? (
                    <Link className="text-link block" href="/app">
                      Open your message spaces
                    </Link>
                  ) : null}
                  {notice.type === 'visit.follow_up' ? (
                    <Link className="text-link block" href="/app/customer#visits">
                      Open my visits
                    </Link>
                  ) : notice.type === 'visit.changed' ? (
                    <Link className="text-link block" href="/app">
                      Open your visit space
                    </Link>
                  ) : null}
                  {notice.readAt ? (
                    <p>Read</p>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={mark.isPending}
                      onClick={() => mark.mutate(notice.id)}
                    >
                      <Check size={18} aria-hidden /> Mark as read
                    </Button>
                  )}
                </article>
              ))}
            {query.hasNextPage ? (
              <Button
                variant="secondary"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? 'Loading more notifications…' : 'More notifications'}
              </Button>
            ) : null}
          </>
        )
      ) : null}
    </section>
  );
}
