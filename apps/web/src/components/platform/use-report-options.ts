'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readReportFilterOptions } from '@hsm/api-client';
import type { ReportOptionQuery, ReportType } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
type Field = ReportOptionQuery['field'];
type Position = { scope: string; draft: string; search: string; cursor?: string };
// RPT-001 / SEC-003: one bounded page, keyed by actor, report and exact parents.
// Derive reset state synchronously so a new parent never uses an old page cursor.
export function useReportOptions(
  actorId: string,
  branchId: string | undefined,
  type: ReportType,
  field: Field,
  parents: { buildingId?: string; floorId?: string } = {},
  enabled = true,
) {
  const scope = JSON.stringify([
    actorId,
    branchId,
    type,
    field,
    parents.buildingId,
    parents.floorId,
  ]);
  const [saved, setSaved] = useState<Position>();
  const current: Position = saved?.scope === scope ? saved : { scope, draft: '', search: '' };
  const active = Boolean(branchId) && enabled;
  const query = useQuery({
    queryKey: [
      'report-options',
      actorId,
      branchId,
      type,
      field,
      parents.buildingId,
      parents.floorId,
      current.search,
      current.cursor,
    ],
    enabled: active,
    gcTime: 0,
    retry: false,
    queryFn: () => {
      if (!branchId) throw new Error('Choose a branch');
      return readReportFilterOptions(browserClient(), branchId, type, {
        field,
        ...parents,
        limit: 20,
        ...(current.search ? { search: current.search } : {}),
        ...(current.cursor ? { cursor: current.cursor } : {}),
      });
    },
  });
  return {
    query,
    ready: !active || (Boolean(query.data) && !query.isFetching && !query.isError),
    draft: current.draft,
    cursor: current.cursor,
    setDraft: (draft: string) => setSaved({ ...current, draft }),
    search: () => setSaved({ scope, draft: current.draft, search: current.draft.trim() }),
    first: () => setSaved({ scope, draft: current.draft, search: current.search }),
    next: () => {
      if (query.data?.nextCursor) setSaved({ ...current, cursor: query.data.nextCursor });
    },
  };
}
export type ReportOptionState = ReturnType<typeof useReportOptions>;
