import { useQuery } from '@tanstack/react-query';
import {
  readHostelRevision,
  saveHostelRevision,
  submitHostelRevision,
  withdrawHostelRevision,
} from '@hsm/api-client';
import { mainBranchDraftSchema } from '@hsm/contracts';
import type {
  HostelBasicsInput,
  HostelOnboarding,
  HostelRevision,
  MainBranchDraftInput,
} from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { useNativeCommand } from './services/use-command';
type Command =
  | {
      kind: 'save';
      expectedVersion: number | null;
      basics?: HostelBasicsInput;
      main?: MainBranchDraftInput;
    }
  | { kind: 'submit' | 'withdraw'; expectedVersion: number };
export const revisionKey = (actorId: string, brandId: string) => [
  'hostel-revision',
  actorId,
  brandId,
];
// CHG-041: an approved main branch is edited through a pending revision; branches and
// unapproved hostels keep the normal setup flow.
export function usesRevision(data: HostelOnboarding | undefined, selectedBranch?: string) {
  return !selectedBranch && data?.mainBranch?.verificationStatus === 'approved';
}
export function useHostelRevision(actorId: string, brandId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: revisionKey(actorId, brandId ?? 'none'),
    enabled: enabled && Boolean(brandId),
    retry: false,
    gcTime: 0,
    queryFn: () =>
      withFreshSession(async () => readHostelRevision(await actorClient(actorId), brandId)),
  });
  const command = useNativeCommand<Command>(
    'hostel-revision:' + (brandId ?? 'none'),
    actorId,
    async (client, body, key) => {
      if (body.kind === 'save') {
        return saveHostelRevision(
          client,
          brandId,
          {
            expectedVersion: body.expectedVersion,
            ...(body.basics ? { basics: body.basics } : {}),
            ...(body.main ? { main: body.main } : {}),
          },
          key,
        );
      }
      const input = { expectedVersion: body.expectedVersion };
      return body.kind === 'submit'
        ? submitHostelRevision(client, brandId, input, key)
        : withdrawHostelRevision(client, brandId, input, key);
    },
    [
      revisionKey(actorId, brandId ?? 'none'),
      ['owner-hostel', actorId, brandId ?? 'none'],
      ['owner-dashboard', actorId],
    ],
  );
  const revision = query.data?.revision ?? null;
  const open = revision && ['draft', 'submitted'].includes(revision.status) ? revision : null;
  return { query, command, revision, open };
}
// Show the Owner's unsent edits on top of the live values so the form opens where they left off.
export function withRevision(
  data: HostelOnboarding,
  open: HostelRevision | null,
): HostelOnboarding {
  if (!open || !data.mainBranch) return data;
  const { basics, main } = open.changes;
  const fields: Record<string, unknown> = { ...(basics ?? {}) };
  delete fields.name;
  delete fields.logoFileId;
  return {
    ...data,
    name: basics?.name ?? data.name,
    logoFileId: basics?.logoFileId ?? data.logoFileId,
    mainBranch: mainBranchDraftSchema.parse({ ...data.mainBranch, ...fields, ...(main ?? {}) }),
  };
}
