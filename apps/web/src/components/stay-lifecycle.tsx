'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  billingFormPaisa,
  checkoutStay,
  extendStay,
  marketplacePrice,
  readBranchOccupancy,
  readStaySettlement,
  recordStayFundMovement,
  transferStay,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { GroupedNumberInput } from './ui/grouped-number-input';
import { SettlementView } from './settlement-view';
import { TransferControls } from './stay-transfer';
import { PostCheckoutRefund } from './stay-refund';
import { useCommand } from './services/use-command';
import { CommandRecovery } from './services/command-recovery';
type Command = { kind: 'transfer' | 'extend' | 'checkout' | 'fund'; body: Record<string, unknown> };
const fundKinds = ['deposit_deduct', 'deposit_refund', 'advance_refund'] as const;
// The server's own result, stated plainly: amended rent, billing continuation or deposit use.
function outcome(result: unknown) {
  const value = (result ?? {}) as {
    agreement?: {
      previousRentPaisa: number;
      rentAmountPaisa: number;
      effectiveFrom: string;
    } | null;
    billing?: { result: string }[];
    depositApplied?: { amountPaisa: number }[];
  };
  if (value.agreement)
    return `Transferred. Rent changes from ${marketplacePrice(value.agreement.previousRentPaisa)} to ${marketplacePrice(value.agreement.rentAmountPaisa)} from ${value.agreement.effectiveFrom}.`;
  if (value.billing?.some((row) => row.result.startsWith('manual')))
    return 'Departure changed. A billing amount needs manual review.';
  if (value.billing?.length) return 'Departure changed and billing continues to the new date.';
  const applied = value.depositApplied?.reduce((sum, row) => sum + row.amountPaisa, 0) ?? 0;
  if (applied > 0) return `Checked out. ${marketplacePrice(applied)} of deposit applied to rent.`;
  return 'Saved by the server.';
}
// RES-005 / OUT-003..006: staff lifecycle actions; each is re-authorized by the server
// with its own grant, and nothing here computes money.
export function StayLifecycle(props: {
  actorId: string;
  branchId: string;
  stayId: string;
  version: number;
  closed: boolean;
  // The directory's live branch access; the server re-checks every action anyway.
  permissions: readonly string[];
  onLockChange?: (locked: boolean) => void;
}) {
  const { actorId, branchId, stayId, version, closed } = props;
  const [leave, setLeave] = useState(''),
    [reason, setReason] = useState(''),
    [source, setSource] = useState(''),
    [fundKind, setFundKind] = useState<(typeof fundKinds)[number]>('deposit_deduct'),
    [amount, setAmount] = useState(''),
    [reference, setReference] = useState(''),
    [applyDeposit, setApplyDeposit] = useState(false);
  const grants = props.permissions;
  const canStay = grants.includes('stay_manage'),
    canSettle = grants.includes('finance_view') && grants.includes('checkout_manage'),
    canReprice = canStay && grants.includes('rent_manage') && grants.includes('finance_view'),
    canApplyDeposit = canSettle && grants.includes('payment_record');
  const free = useQuery({
    queryKey: ['bed-board', actorId, branchId, 'available-for-transfer'],
    enabled: canStay && !closed,
    gcTime: 0,
    queryFn: () =>
      readBranchOccupancy(browserClient(), branchId, { state: 'available', limit: 50 }),
  });
  const settlement = useQuery({
    queryKey: ['stay-settlement', actorId, branchId, stayId],
    enabled: canSettle && !closed,
    gcTime: 0,
    queryFn: () => readStaySettlement(browserClient(), stayId, branchId),
  });
  const run = useCommand(
    'StayLifecycle:run',
    async (command: Command, key: string): Promise<unknown> => {
      const client = browserClient();
      if (command.kind === 'transfer')
        return transferStay(client, branchId, stayId, command.body, key);
      if (command.kind === 'extend') return extendStay(client, branchId, stayId, command.body, key);
      if (command.kind === 'fund')
        return recordStayFundMovement(client, branchId, stayId, command.body, key);
      return checkoutStay(client, branchId, stayId, command.body, key);
    },
    [
      ['stay-record', actorId, branchId, stayId],
      ['private-stays', actorId, branchId],
      ['stay-settlement', actorId, branchId, stayId],
      ['bed-board', actorId, branchId],
      ['dashboard-queue', actorId, branchId],
      ['owner-dashboard', actorId],
      ['branch-dashboard', actorId, branchId],
    ],
  );
  useEffect(() => {
    props.onLockChange?.(run.isPending || run.unresolved);
    return () => props.onLockChange?.(false);
  }, [props.onLockChange, run.isPending, run.unresolved]);
  if (closed)
    return (
      <>
        <CommandRecovery command={run} />
        {run.isError ? <p role="alert">{errorMessage(run.error)}</p> : null}
        <SettlementView actorId={actorId} branchId={branchId} stayId={stayId} closed />
        {canSettle ? (
          <PostCheckoutRefund actorId={actorId} branchId={branchId} stayId={stayId} />
        ) : null}
      </>
    );
  const beds = free.data?.data.flatMap((room) =>
    room.beds.map((bed) => ({
      roomId: room.id,
      bedId: bed.id,
      label: room.label + ' · ' + bed.label,
    })),
  );
  let paisa: number | undefined;
  try {
    paisa = amount ? billingFormPaisa(amount) : undefined;
  } catch {
    paisa = undefined;
  }
  const busy = run.isPending;
  return (
    <section aria-label="Stay lifecycle" className="space-y-3">
      <CommandRecovery command={run} />
      {run.isError ? <p role="alert">{errorMessage(run.error)}</p> : null}
      {run.isSuccess ? <p role="status">{outcome(run.data)}</p> : null}
      <label className="field-label">
        Reason (required for each action)
        <input
          aria-label="Lifecycle reason"
          className="field-input"
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {canStay ? (
        <div className="space-y-2">
          <TransferControls
            beds={beds}
            reason={reason}
            busy={busy}
            canReprice={canReprice}
            onTransfer={(body) =>
              run.mutate({
                kind: 'transfer',
                body: { expectedVersion: version, ...body, reason: reason.trim() },
              })
            }
          />
          <label className="field-label">
            New expected departure
            <input
              aria-label="New expected departure"
              type="date"
              className="field-input"
              value={leave}
              onChange={(event) => setLeave(event.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            disabled={!leave || !reason.trim() || busy}
            onClick={() =>
              run.mutate({
                kind: 'extend',
                body: { expectedVersion: version, expectedLeaveDate: leave, reason: reason.trim() },
              })
            }
          >
            Change departure date
          </Button>
        </div>
      ) : null}
      {canSettle ? (
        <div className="space-y-2">
          <SettlementView actorId={actorId} branchId={branchId} stayId={stayId} closed={false} />
          <label className="field-label">
            Source payment
            <select
              aria-label="Fund source payment"
              className="field-input"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="">Choose a receipt</option>
              {settlement.data?.fundSources.map((row) => (
                <option key={row.paymentId} value={row.paymentId}>
                  {row.receiptNumber} · deposit {marketplacePrice(row.depositPaisa)} · advance{' '}
                  {marketplacePrice(row.advanceCreditPaisa)}
                </option>
              ))}
            </select>
          </label>
          <select
            aria-label="Fund action"
            className="field-input"
            value={fundKind}
            onChange={(event) =>
              setFundKind(fundKinds.find((kind) => kind === event.target.value) ?? 'deposit_deduct')
            }
          >
            <option value="deposit_deduct">Deduct from deposit</option>
            <option value="deposit_refund">Record deposit refund paid by the hostel</option>
            <option value="advance_refund">Record advance refund paid by the hostel</option>
          </select>
          <GroupedNumberInput
            aria-label="Fund amount (PKR)"
            className="field-input"
            value={amount}
            onValueChange={(value) => setAmount(value)}
          />
          <input
            aria-label="External refund reference (optional)"
            className="field-input"
            maxLength={160}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!source || !paisa || !reason.trim() || busy}
            onClick={() =>
              run.mutate({
                kind: 'fund',
                body: {
                  paymentId: source,
                  movement: {
                    kind: fundKind,
                    amountPaisa: paisa,
                    reason: reason.trim(),
                    ...(reference.trim() && fundKind !== 'deposit_deduct'
                      ? { externalReference: reference.trim() }
                      : {}),
                  },
                },
              })
            }
          >
            Record fund action
          </Button>
          {canApplyDeposit ? (
            <label className="field-label">
              <input
                type="checkbox"
                checked={applyDeposit}
                onChange={(event) => setApplyDeposit(event.target.checked)}
              />{' '}
              Apply the held deposit to unpaid invoices at checkout
            </label>
          ) : null}
          <Button
            disabled={!reason.trim() || busy}
            onClick={() =>
              run.mutate({
                kind: 'checkout',
                body: {
                  expectedVersion: version,
                  reason: reason.trim(),
                  applyAvailableDeposit: canApplyDeposit && applyDeposit,
                },
              })
            }
          >
            Complete checkout
          </Button>
          <p>
            Checkout releases the bed and freezes the statement. Any deposit left after it is
            refunded by the hostel and recorded here.
          </p>
        </div>
      ) : null}
    </section>
  );
}
