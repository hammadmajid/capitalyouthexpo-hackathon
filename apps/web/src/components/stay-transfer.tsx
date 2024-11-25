'use client';
import { useState } from 'react';
import { billingFormPaisa } from '@hsm/api-client';
import { Button } from './ui/button';
import { GroupedNumberInput } from './ui/grouped-number-input';
type Bed = { roomId: string; bedId: string; label: string };
// RES-005 / P9-FIX-01: a transfer keeps the agreed rent unless staff with rent authority
// enter the new rent the resident agreed to; the server dates it from the first unbilled period.
export function TransferControls(props: {
  beds: Bed[] | undefined;
  reason: string;
  busy: boolean;
  canReprice: boolean;
  onTransfer: (body: Record<string, unknown>) => void;
}) {
  const [bedId, setBedId] = useState(''),
    [reprice, setReprice] = useState(false),
    [rent, setRent] = useState(''),
    [agreed, setAgreed] = useState(false);
  const target = props.beds?.find((bed) => bed.bedId === bedId);
  let paisa: number | undefined;
  try {
    paisa = rent ? billingFormPaisa(rent) : undefined;
  } catch {
    paisa = undefined;
  }
  const priced = !reprice || (paisa !== undefined && agreed);
  return (
    <div className="space-y-2">
      <label className="field-label">
        Transfer to available bed
        <select
          aria-label="Transfer target bed"
          className="field-input"
          value={bedId}
          onChange={(event) => setBedId(event.target.value)}
        >
          <option value="">Choose a bed</option>
          {props.beds?.map((bed) => (
            <option key={bed.bedId} value={bed.bedId}>
              {bed.label}
            </option>
          ))}
        </select>
      </label>
      {props.canReprice ? (
        <label className="field-label">
          <input
            type="checkbox"
            checked={reprice}
            onChange={(event) => setReprice(event.target.checked)}
          />{' '}
          Change the monthly rent with this transfer
        </label>
      ) : null}
      {reprice ? (
        <>
          <GroupedNumberInput
            aria-label="New monthly rent (PKR)"
            className="field-input"
            value={rent}
            onValueChange={(value) => setRent(value)}
          />
          <label className="field-label">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />{' '}
            The resident agreed to this rent
          </label>
          <p>
            The new rent applies from the first billing period not yet invoiced. Issued invoices
            keep their amounts.
          </p>
        </>
      ) : null}
      <Button
        variant="secondary"
        disabled={!target || !props.reason.trim() || props.busy || !priced}
        onClick={() => {
          if (target)
            props.onTransfer({
              target: { kind: 'bed', roomId: target.roomId, bedId: target.bedId },
              ...(reprice && paisa !== undefined
                ? { repricing: { rentAmountPaisa: paisa, residentAgreed: true } }
                : {}),
            });
        }}
      >
        Transfer resident
      </Button>
    </div>
  );
}
