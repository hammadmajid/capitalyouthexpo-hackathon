'use client';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  branchSummarySchema,
  inventoryPageSequenceIsValid,
  type ReportNamedOption,
} from '@hsm/contracts';
import { ClientFailure, readApi } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
const pageSchema = z
  .object({ data: z.array(branchSummarySchema).max(20), nextCursor: z.string().uuid().nullable() })
  .strict();
// OWN-004 / RPT-001: page actual authorized branch names, independently of the
// dashboard's presentation ceiling. Keep at most the 50 selected report IDs.
export function ReportBranches({
  actorId,
  selected,
  onChange,
  disabled,
  children,
}: {
  actorId: string;
  selected: ReportNamedOption[];
  onChange: (rows: ReportNamedOption[]) => void;
  disabled: boolean;
  children: (ready: boolean) => ReactNode;
}) {
  const [cursor, setCursor] = useState<string>();
  const query = useQuery({
    queryKey: ['report-owner-branches', actorId, cursor],
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const page = await readApi(
        browserClient().GET('/v1/owner/branches', {
          params: { query: { limit: 20, ...(cursor ? { cursor } : {}) } },
        }),
        pageSchema,
      );
      if (
        !inventoryPageSequenceIsValid(page.data, cursor) ||
        (page.nextCursor !== null &&
          (page.data.length !== 20 || page.nextCursor !== page.data.at(-1)?.id))
      )
        throw new ClientFailure('INVALID_RESPONSE');
      return page;
    },
  });
  const ready = Boolean(query.data) && !query.isFetching && !query.isError;
  return (
    <div className="space-y-2">
      <h4 className="font-semibold">Report branches</h4>
      <p>
        No selected branches means all authorized branches. Select one to enable location and
        resident filters.
      </p>
      {query.isError ? (
        <>
          <p role="alert">{errorMessage(query.error)}</p>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry report branch access
          </Button>
        </>
      ) : (
        <>
          {!query.data ? <p role="status">Loading report branches…</p> : null}
          {query.data?.data.map((row) => (
            <label key={row.id} className="flex gap-2">
              <input
                type="checkbox"
                aria-label={'Report branch ' + row.name}
                checked={selected.some((value) => value.id === row.id)}
                disabled={
                  disabled ||
                  !ready ||
                  (selected.length >= 50 && !selected.some((value) => value.id === row.id))
                }
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, { id: row.id, name: row.name, detail: null, archived: false }]
                      : selected.filter((value) => value.id !== row.id),
                  )
                }
              />
              {row.name}
            </label>
          ))}
          {selected.length ? (
            <div>
              <p>Selected: {selected.map((row) => row.name).join(', ')}</p>
              <Button
                type="button"
                variant="secondary"
                disabled={disabled || !ready}
                onClick={() => onChange([])}
              >
                Use all report branches
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !ready || !cursor}
            onClick={() => setCursor(undefined)}
          >
            First report branches
          </Button>{' '}
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !ready || !query.data?.nextCursor}
            onClick={() => {
              if (query.data?.nextCursor) setCursor(query.data.nextCursor);
            }}
          >
            More report branches
          </Button>
        </>
      )}
      {ready ? (
        children(ready)
      ) : (
        <p role="status">Report downloads are unavailable until branch access refreshes.</p>
      )}
    </div>
  );
}
