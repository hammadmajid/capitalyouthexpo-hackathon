'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from './ui/button';
export function OwnerChoice({
  label,
  queryKey,
  load,
  choose,
  selectedId,
}: {
  label: string;
  selectedId?: string | null | undefined;
  queryKey: readonly unknown[];
  load: (
    cursor?: string,
  ) => Promise<{ data: { id: string; name: string }[]; nextCursor: string | null }>;
  choose: (item: { id: string; name: string }) => void;
}) {
  const [pages, setPages] = useState<string[]>([]),
    cursor = pages.at(-1);
  const query = useQuery({
    queryKey: [...queryKey, cursor],
    queryFn: () => load(cursor),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <section className="space-y-3" aria-label={label}>
      <h3 className="text-lg font-semibold">{label}</h3>
      {query.isError ? (
        <>
          <p role="alert">Unable to load choices.</p>
          <Button
            onClick={() => {
              void query.refetch();
            }}
          >
            Retry {label}
          </Button>
        </>
      ) : !query.data ? (
        <p role="status">Loading choices…</p>
      ) : (
        <>
          {query.data.data.length === 0 ? (
            <p>No choices available.</p>
          ) : (
            query.data.data.map((item) => (
              <Button
                key={item.id}
                variant={selectedId === item.id ? 'primary' : 'secondary'}
                aria-pressed={selectedId === undefined ? undefined : selectedId === item.id}
                onClick={() => choose(item)}
              >
                {item.name}
              </Button>
            ))
          )}
          {pages.length ? (
            <Button
              variant="secondary"
              onClick={() => setPages((previous) => previous.slice(0, -1))}
            >
              Previous {label}
            </Button>
          ) : null}
          {query.data.nextCursor ? (
            <Button
              variant="secondary"
              onClick={() => {
                const next = query.data.nextCursor;
                if (next && next !== cursor) setPages((previous) => [...previous, next]);
              }}
            >
              More {label}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
