'use client';
import { useQuery } from '@tanstack/react-query';
import { formatDate, type StayRecord } from '@hsm/contracts';
import { marketplacePrice, readOwnStayRecord, readStaffStayRecord } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { AgreementPanels } from './agreements/agreement-panels';
import { Button } from './ui/button';
import { StayResidentPhoto } from './residents/stay-resident-photo';
type Props = { actorId: string; stayId: string; branchId?: string };
const stateLabel = (state: string) => state.replaceAll('_', ' ');
function Agreements({ record, ...props }: Props & { record: StayRecord }) {
  return (
    <section aria-label="Agreement summary" className="space-y-1">
      <h4 className="font-semibold">Agreement</h4>
      {record.agreements.map((agreement) => (
        <div key={agreement.id} className="space-y-1">
          <p>
            Version {agreement.version} from {agreement.effectiveFrom}
            {agreement.fromBooking ? ' · from confirmed booking' : ' · walk-in admission'}
          </p>
          <p>Agreed rent: {marketplacePrice(agreement.terms.rentAmountPaisa)} per billing period</p>
          <p>Deposit: {marketplacePrice(agreement.terms.depositPaisa)}</p>
          {agreement.terms.fees.map((fee) => (
            <p key={fee.code + ':' + fee.cadence}>
              {fee.code}: {marketplacePrice(fee.amountPaisa)} (
              {fee.cadence === 'monthly' ? 'monthly' : 'one time'})
            </p>
          ))}
          <p>
            Billing: {stateLabel(agreement.terms.policy.cycle.kind)}, notice{' '}
            {agreement.terms.policy.noticeDays} days, grace {agreement.terms.policy.graceDays} days
          </p>
          <AgreementPanels
            actorId={props.actorId}
            stayId={props.stayId}
            agreement={agreement}
            {...(props.branchId ? { branchId: props.branchId } : {})}
          />
        </div>
      ))}
    </section>
  );
}
// STAY-002 / RES-005: the Stay's original agreement, accommodation and lifecycle history,
// read on demand from the server (staff with stay_manage, or the linked account itself).
export function StayRecordPanel({ actorId, stayId, branchId }: Props) {
  const record = useQuery({
    queryKey: ['stay-record', actorId, branchId ?? 'own', stayId],
    gcTime: 0,
    retry: false,
    queryFn: () =>
      branchId
        ? readStaffStayRecord(browserClient(), branchId, stayId)
        : readOwnStayRecord(browserClient(), stayId),
  });
  if (record.isPending) return <p role="status">Loading agreement and history…</p>;
  if (record.isError)
    return (
      <div className="space-y-2">
        <p role="alert">{errorMessage(record.error)}</p>
        <Button variant="secondary" onClick={() => void record.refetch()}>
          Retry agreement and history
        </Button>
      </div>
    );
  const data = record.data;
  return (
    <section aria-label="Stay record" className="space-y-3">
      <StayResidentPhoto actorId={actorId} stayId={stayId} branchId={branchId} />
      <p>Hostel branch: {data.branch.name}</p>
      <Agreements
        record={data}
        actorId={actorId}
        stayId={stayId}
        {...(branchId ? { branchId } : {})}
      />
      <section aria-label="Accommodation history" className="space-y-1">
        <h4 className="font-semibold">Accommodation</h4>
        {data.assignments.length === 0 ? <p>No accommodation recorded.</p> : null}
        <ul>
          {data.assignments.map((assignment) => (
            <li key={assignment.id}>
              {assignment.roomTypeName} · Room {assignment.roomLabel}
              {assignment.bedLabel ? ' · Bed ' + assignment.bedLabel : ' · whole room'} — from{' '}
              {formatDate(assignment.startedAt)}
              {assignment.endedAt ? ' to ' + formatDate(assignment.endedAt) : ' (current)'}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Stay history" className="space-y-1">
        <h4 className="font-semibold">History</h4>
        <ul>
          {data.history.map((entry) => (
            <li key={entry.id}>
              {formatDate(entry.createdAt)}:{' '}
              {entry.previousState ? stateLabel(entry.previousState) + ' → ' : ''}
              {stateLabel(entry.nextState)} ({stateLabel(entry.reasonCode)})
            </li>
          ))}
        </ul>
      </section>
      {data.truncated ? <p>Only the most recent 50 entries of each list are shown.</p> : null}
    </section>
  );
}
