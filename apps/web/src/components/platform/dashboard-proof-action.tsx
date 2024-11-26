'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readInventoryAccess } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { PaymentReview } from '../payment-review';
import { Button } from '../ui/button';
type Branch = { branchId: string; branchName: string };
export function DashboardProofAction(props: {
  actorId: string;
  branches: Branch[];
  count: number;
}) {
  return (
    <ProofAction
      key={props.actorId + ':' + props.branches.map((b) => b.branchId).join(':')}
      {...props}
    />
  );
}
function ProofAction({
  actorId,
  branches,
  count,
}: {
  actorId: string;
  branches: Branch[];
  count: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-expanded={open}>
        Payment proofs to verify: {count}
      </Button>
      {open ? (
        <section aria-label="Choose payment proof branch">
          <p>Choose a branch to review its submitted payment proofs.</p>
          {branches.map((branch) => (
            <ProofBranch key={branch.branchId} actorId={actorId} branch={branch} />
          ))}
          {!branches.length ? <p>No branches are available.</p> : null}
        </section>
      ) : null}
    </>
  );
}
function ProofBranch({ actorId, branch }: { actorId: string; branch: Branch }) {
  const [open, setOpen] = useState(false);
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branch.branchId],
    queryFn: () => readInventoryAccess(browserClient(), branch.branchId),
    gcTime: 0,
    retry: false,
  });
  if (access.isPending) return <p role="status">Checking payment queue access…</p>;
  if (access.error || !access.data.permissions.includes('finance_view'))
    return <p>Payment queue access unavailable.</p>;
  return (
    <div hidden={access.isFetching}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {branch.branchName}
      </Button>
      {open ? <PaymentReview actorId={actorId} branchId={branch.branchId} initialOpen /> : null}
    </div>
  );
}
