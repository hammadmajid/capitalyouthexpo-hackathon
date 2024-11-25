'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideResidentAccountLink, readResidentAccountLinks } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';

export function ResidentLinkRequests({ actorId, branchId }: { actorId: string; branchId: string }) {
  const cache = useQueryClient(),
    [cursor, setCursor] = useState<string>();
  const key = ['resident-account-links', actorId, branchId];
  const page = useQuery({
    queryKey: [...key, cursor],
    gcTime: 0,
    retry: false,
    queryFn: () => readResidentAccountLinks(browserClient(), branchId, cursor),
  });
  const decision = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      decideResidentAccountLink(browserClient(), branchId, id, { action }),
    onSettled: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: key }),
        cache.invalidateQueries({ queryKey: ['resident-directory', actorId, branchId] }),
        cache.invalidateQueries({ queryKey: ['private-stays'] }),
      ]);
    },
  });
  if (page.isError) return <p role="alert">{errorMessage(page.error)}</p>;
  if (!page.data?.data.length && !cursor) return null;
  return (
    <section aria-label="Account link requests" className="space-y-3">
      <h3 className="font-semibold">Account requests</h3>
      {page.data?.data.map((row) => (
        <div key={row.id} className="space-y-2">
          <p>
            {row.customerName} → {row.residentName} · {row.phone}
          </p>
          <p>
            Approve only if this is the resident. Their account will show this stay and its bills.
          </p>
          <Button
            disabled={decision.isPending || page.isFetching}
            onClick={() => decision.mutate({ id: row.id, action: 'approve' })}
          >
            Approve account
          </Button>
          <Button
            variant="secondary"
            disabled={decision.isPending || page.isFetching}
            onClick={() => decision.mutate({ id: row.id, action: 'reject' })}
          >
            Reject
          </Button>
        </div>
      ))}
      {decision.isError ? <p role="alert">{errorMessage(decision.error)}</p> : null}
      {page.data?.nextCursor ? (
        <Button variant="secondary" onClick={() => setCursor(page.data?.nextCursor ?? undefined)}>
          More account requests
        </Button>
      ) : null}
      {cursor ? (
        <Button variant="secondary" onClick={() => setCursor(undefined)}>
          First account requests
        </Button>
      ) : null}
    </section>
  );
}
