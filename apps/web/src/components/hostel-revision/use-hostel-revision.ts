'use client';
import { useQuery } from '@tanstack/react-query';
import {
  readHostelRevision,
  saveHostelRevision,
  submitHostelRevision,
  withdrawHostelRevision,
} from '@hsm/api-client';
import type { HostelBasicsInput, MainBranchDraftInput } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { useCommand } from '../services/use-command';
import { openRevision } from './revision-fields';
export type RevisionPart = { basics: HostelBasicsInput } | { main: MainBranchDraftInput };
type Command =
  | ({ kind: 'save'; expectedVersion: number | null } & RevisionPart)
  | { kind: 'submit' | 'withdraw'; expectedVersion: number };
export const revisionKey = (actorId: string, brandId: string) => [
  'hostel-revision',
  actorId,
  brandId,
];
function run(brandId: string, body: Command, key: string) {
  const client = browserClient();
  if (body.kind === 'save') {
    const part = 'basics' in body ? { basics: body.basics } : { main: body.main };
    return saveHostelRevision(
      client,
      brandId,
      { expectedVersion: body.expectedVersion, ...part },
      key,
    );
  }
  const input = { expectedVersion: body.expectedVersion };
  return body.kind === 'submit'
    ? submitHostelRevision(client, brandId, input, key)
    : withdrawHostelRevision(client, brandId, input, key);
}
// CHG-041: the approved hostel stays live; the Owner's edits wait in one versioned revision.
export function useHostelRevision(actorId: string, brandId: string) {
  const query = useQuery({
    queryKey: revisionKey(actorId, brandId),
    retry: false,
    gcTime: 0,
    queryFn: () => readHostelRevision(browserClient(), brandId),
  });
  const command = useCommand<Command>(
    'hostel-revision:' + brandId,
    (body, key) => run(brandId, body, key),
    [revisionKey(actorId, brandId), ['owner-hostel', actorId, brandId]],
  );
  const revision = query.data?.revision ?? null,
    open = openRevision(revision);
  // Each save carries the version it was based on, so a stale tab cannot overwrite newer edits.
  const save = (part: RevisionPart) =>
    command.mutateAsync({ kind: 'save', expectedVersion: open?.version ?? null, ...part });
  return { query, command, revision, open, save };
}
