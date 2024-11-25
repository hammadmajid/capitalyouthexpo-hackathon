'use client';
import { BedBoard } from './bed-board';
import { ResidentDirectory } from './resident-directory';
import { RentBoard } from './rent-board';
import { PaymentReview } from './payment-review';
import { BranchServicesPanel } from './services/panels';
import { BranchDashboard, ReportDownloads } from './platform/dashboards';
import { StaffWorkspace } from './staff/staff-workspace';
import { RoomsPanel } from './setup/rooms-panel';
import { Waitlist } from './waitlist';
import { Chat } from './chat';
import { Visits } from './visits';
import { StayDirectory } from './stay-directory';
import { BillingCatalog } from './billing-catalog';
import { BillingPolicySettings } from './billing-policy-settings';
import { BookingPolicySettings } from './booking-policy-settings';
import { InventoryBlocks } from './inventory-blocks';
import { ListingRules } from './listing-rules';
import { BranchInventory } from './branch-inventory';
import { HostelBookings } from './hostel-bookings';
import { OwnerDocumentReview } from './owner-document-review';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { branchSummarySchema } from '@hsm/contracts';
import { readApi } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
const page = z
  .object({ data: z.array(branchSummarySchema), nextCursor: z.string().uuid().nullable() })
  .strict();
type BranchProps = { context: 'owner' | 'manager'; actorId?: string };
export function Branches(props: BranchProps) {
  return <ScopedBranches key={(props.actorId ?? 'unavailable') + ':' + props.context} {...props} />;
}
function ScopedBranches({ context, actorId }: BranchProps) {
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState('');
  const branches = useQuery({
    queryKey: ['branches', context, actorId, cursor],
    gcTime: 0,
    queryFn: () =>
      readApi(
        browserClient().GET(context === 'owner' ? '/v1/owner/branches' : '/v1/manage/branches', {
          params: { query: { limit: 50, ...(cursor ? { cursor } : {}) } },
        }),
        page,
      ),
  });
  const selectedBranch = branches.data?.data.find((branch) => branch.id === selected);
  if (branches.isPending)
    return (
      <p className="mt-5" role="status">
        Loading your branches…
      </p>
    );
  if (branches.error)
    return (
      <div className="mt-5 space-y-4">
        <p role="alert">{errorMessage(branches.error)}</p>
        <Button variant="secondary" onClick={() => void branches.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!branches.data?.data.length)
    return <p className="mt-5">No branches are available in this space.</p>;
  return (
    <div className="mt-6 max-w-lg space-y-5">
      <div>
        <label htmlFor="branch" className="field-label">
          Your branch
        </label>
        <select
          id="branch"
          className="field-input"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Choose a branch</option>
          {branches.data.data.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </div>
      {selected && branches.data.data.some((branch) => branch.id === selected) && (
        <p className="text-sm">
          Selected: {branches.data.data.find((branch) => branch.id === selected)?.name}
        </p>
      )}
      {actorId && selected && branches.data.data.some((branch) => branch.id === selected) ? (
        <>
          <BookingPolicySettings actorId={actorId} target={{ level: 'branch', id: selected }} />
          <BillingPolicySettings
            actorId={actorId}
            target={{ branchId: selected }}
            accessUnavailable={Boolean(branches.error) || branches.isFetching}
          />
          <RoomsPanel key={'rooms:' + selected} actorId={actorId} branchId={selected} />
          <BranchInventory
            actorId={actorId}
            branchId={selected}
            {...(selectedBranch ? { branchLabel: selectedBranch.name } : {})}
          />
          <BillingCatalog
            actorId={actorId}
            branchId={selected}
            accessUnavailable={Boolean(branches.error) || branches.isFetching}
          />
          <ListingRules actorId={actorId} branchId={selected} />
          <InventoryBlocks actorId={actorId} branchId={selected} />
          <BedBoard actorId={actorId} branchId={selected} />
          <ResidentDirectory actorId={actorId} branchId={selected} />
          <RentBoard actorId={actorId} branchId={selected} />
          <PaymentReview actorId={actorId} branchId={selected} />
          <StaffWorkspace
            key={'staff:' + selected}
            actorId={actorId}
            branchId={selected}
            canSetUp={context === 'owner'}
          />
          <BranchServicesPanel actorId={actorId} branchId={selected} />
          <BranchDashboard actorId={actorId} branchId={selected} context={context} />
          <ReportDownloads actorId={actorId} branchId={selected} />
          <HostelBookings actorId={actorId} branchId={selected} />
          <Visits
            actorId={actorId}
            branchId={selected}
            accessUnavailable={Boolean(branches.error) || branches.isFetching}
          />
          <StayDirectory
            actorId={actorId}
            branchId={selected}
            accessUnavailable={Boolean(branches.error) || branches.isFetching}
          />
          <Waitlist
            actorId={actorId}
            branchId={selected}
            accessUnavailable={Boolean(branches.error) || branches.isFetching}
          />
          <Chat
            actorId={actorId}
            branchId={selected}
            accessUnavailable={Boolean(branches.error) || branches.isFetching}
          />
        </>
      ) : null}
      {context === 'owner' &&
        actorId &&
        selected &&
        branches.data.data.some((branch) => branch.id === selected) && (
          <OwnerDocumentReview
            key={actorId + ':' + selected}
            actorId={actorId}
            branchId={selected}
          />
        )}
      {branches.data.nextCursor && (
        <Button
          variant="secondary"
          onClick={() => {
            setSelected('');
            setCursor(branches.data?.nextCursor ?? undefined);
          }}
        >
          Next branches
        </Button>
      )}
      {cursor && (
        <Button
          variant="ghost"
          onClick={() => {
            setSelected('');
            setCursor(undefined);
          }}
        >
          Back to first page
        </Button>
      )}
    </div>
  );
}
