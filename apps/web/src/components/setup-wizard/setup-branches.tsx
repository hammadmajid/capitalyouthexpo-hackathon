'use client';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { readApi } from '@hsm/api-client';
import { branchSummarySchema, type HostelOnboarding } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { canAddBranch, editableStatuses } from './setup-steps';
import type { SetupTarget } from './use-setup-draft';
const page = z
  .object({ data: z.array(branchSummarySchema), nextCursor: z.string().uuid().nullable() })
  .strict();
// BRN-001: other branches of this hostel each run their own setup and are verified separately.
export function SetupBranches(props: {
  actorId: string;
  hostel: HostelOnboarding;
  open: (target: SetupTarget) => void;
}) {
  const { hostel } = props;
  const branches = useQuery({
    queryKey: ['branches', props.actorId, 'owner', 'setup'],
    retry: false,
    queryFn: () =>
      readApi(
        browserClient().GET('/v1/owner/branches', { params: { query: { limit: 50 } } }),
        page,
      ),
  });
  const others = (branches.data?.data ?? []).filter(
    (row) => row.brandId === hostel.id && row.id !== hostel.mainBranch?.id,
  );
  return (
    <section aria-label="Branches" className="space-y-2">
      <h3 className="text-xl font-semibold text-hsm-heading">Branches</h3>
      {branches.isPending ? <p role="status">Loading branches…</p> : null}
      {branches.error ? <p role="alert">{errorMessage(branches.error)}</p> : null}
      {others.map((row) => (
        <Button key={row.id} variant="secondary" onClick={() => props.open({ branchId: row.id })}>
          {editableStatuses.includes(row.verificationStatus)
            ? 'Continue ' + row.name + ' setup'
            : 'Manage ' + row.name + ' · ' + row.verificationStatus.replaceAll('_', ' ')}
        </Button>
      ))}
      {canAddBranch(hostel) ? (
        <Button variant="secondary" onClick={() => props.open({ adding: true })}>
          Add branch
        </Button>
      ) : (
        <p className="text-sm text-hsm-secondary">Submit the main branch to add more branches.</p>
      )}
    </section>
  );
}
// BRN-001: a new branch follows the same steps; the hostel name is fixed and the first save
// creates the branch draft.
export function AddBranchOverview(props: {
  hostel: HostelOnboarding;
  start: () => void;
  back: () => void;
}) {
  return (
    <section aria-label="Add Branch" className="space-y-3">
      <Button variant="ghost" onClick={props.back}>
        Back to hostel
      </Button>
      <h2 className="text-2xl font-bold text-hsm-heading">Add Branch</h2>
      <p className="text-hsm-secondary">New branch of {props.hostel.name}</p>
      <p>Verified separately · private until approved</p>
      {canAddBranch(props.hostel) ? (
        <Button onClick={props.start}>Start the new branch</Button>
      ) : (
        <p role="status">Submit the main branch first.</p>
      )}
    </section>
  );
}
