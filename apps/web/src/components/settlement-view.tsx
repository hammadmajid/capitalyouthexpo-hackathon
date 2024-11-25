'use client';
import { useQuery } from '@tanstack/react-query';
import type { StayFinalStatementResponse, StaySettlement } from '@hsm/contracts';
import { marketplacePrice, readFinalStatement, readStaySettlement } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
// OUT-005: figures come only from the server's ledger-derived settlement.
export function SettlementFigures({ settlement }: { settlement: StaySettlement }) {
  return (
    <dl className="grid grid-cols-2 gap-1" aria-label="Settlement figures">
      <dt>Outstanding invoices</dt>
      <dd>{marketplacePrice(settlement.outstandingPaisa)}</dd>
      <dt>Deposit held</dt>
      <dd>{marketplacePrice(settlement.deposit.heldPaisa)}</dd>
      <dt>Deposit deducted</dt>
      <dd>{marketplacePrice(settlement.deposit.deductedPaisa)}</dd>
      <dt>Deposit refunded</dt>
      <dd>{marketplacePrice(settlement.deposit.refundedPaisa)}</dd>
      <dt>Advance credit</dt>
      <dd>{marketplacePrice(settlement.advance.heldPaisa)}</dd>
      <dt>Resident still owes</dt>
      <dd>{marketplacePrice(settlement.netPayablePaisa)}</dd>
      <dt>Hostel still owes back</dt>
      <dd>{marketplacePrice(settlement.netRefundablePaisa)}</dd>
    </dl>
  );
}
// OUT-005/006 / STAY-004: live settlement while open; the frozen statement once closed.
export function SettlementView(props: {
  actorId: string;
  stayId: string;
  branchId?: string;
  closed: boolean;
}) {
  const live = useQuery({
    queryKey: ['stay-settlement', props.actorId, props.branchId ?? 'own', props.stayId],
    enabled: !props.closed,
    gcTime: 0,
    retry: false,
    queryFn: () => readStaySettlement(browserClient(), props.stayId, props.branchId),
  });
  const final = useQuery({
    queryKey: ['final-statement', props.actorId, props.branchId ?? 'own', props.stayId],
    enabled: props.closed,
    gcTime: 0,
    retry: false,
    queryFn: () => readFinalStatement(browserClient(), props.stayId, props.branchId),
  });
  const query = props.closed ? final : live;
  if (query.isPending) return <p role="status">Loading settlement…</p>;
  if (query.isError) return <p role="alert">{errorMessage(query.error)}</p>;
  const settlement = props.closed ? final.data?.statement : live.data;
  if (!settlement) return null;
  return (
    <section aria-label={props.closed ? 'Final statement' : 'Settlement'} className="space-y-1">
      <h4 className="font-semibold">{props.closed ? 'Final statement' : 'Settlement so far'}</h4>
      <SettlementFigures settlement={settlement} />
      {props.closed && final.data ? <AfterCheckout value={final.data.afterCheckout} /> : null}
    </section>
  );
}
const movementLabel: Record<string, string> = {
  deposit_apply: 'Deposit applied to rent',
  advance_apply: 'Advance applied to rent',
  deposit_deduct: 'Deposit deducted',
  deposit_refund: 'Deposit refund recorded',
  advance_refund: 'Advance refund recorded',
  payment: 'Payment received',
};
// P9-FIX-04: the frozen statement stays as it was; later records and today's balance sit
// beside it. Only a recorded movement counts as refunded; what is owed is shown as owed.
function AfterCheckout({ value }: { value: StayFinalStatementResponse['afterCheckout'] }) {
  return (
    <section aria-label="After checkout" className="space-y-1">
      <h5 className="font-semibold">Recorded after checkout</h5>
      {value.movements.length === 0 ? (
        <p>Nothing has been recorded since checkout.</p>
      ) : (
        <ul>
          {value.movements.map((row, index) => (
            <li key={row.recordedAt + index}>
              {row.recordedAt.slice(0, 10)}: {movementLabel[row.kind] ?? row.kind}{' '}
              {marketplacePrice(row.amountPaisa)}
              {row.externalReference ? ' · ref ' + row.externalReference : ''}
            </li>
          ))}
        </ul>
      )}
      <p>
        Balance today: resident owes {marketplacePrice(value.current.netPayablePaisa)}; refund still
        owed by the hostel {marketplacePrice(value.current.netRefundablePaisa)}.
      </p>
      <p>Refunds are paid by the hostel directly and appear here only once recorded.</p>
    </section>
  );
}
